"""Logica de ejecucion del analisis, separada de AnalyzeView (Fase 1+ de la
migracion a async con Cloud Tasks, ver plan) para que la pueda invocar tanto
el modo sincrono actual (Fase 1) como el endpoint interno
POST /analyze/<id>/procesar que Cloud Tasks invocara mas adelante (Fase 2+),
sin duplicar el codigo que llama al provider."""

from django.conf import settings

from .contracts import DocumentAnalysisRequest, DriveFileRef
from .models import AnalysisJob, AnalysisRequestLog
from .providers import get_provider
from .storage import fetch_staging


def ejecutar_analisis(job: AnalysisJob) -> AnalysisJob:
    """Corre el analisis de un AnalysisJob ya persistido en staging, actualiza
    su estado y escribe la bitacora historica (AnalysisRequestLog) al
    terminar. No decide reintentos - eso lo maneja quien invoca esto
    (Fase 1: AnalyzeView, sincrono; Fase 2+: el endpoint /procesar segun la
    respuesta de Cloud Tasks)."""

    job.status = AnalysisJob.PROCESANDO
    job.intentos += 1
    job.save(update_fields=["status", "intentos", "updated_at"])

    document_bytes = fetch_staging(job.gcs_uri)

    analysis_request = DocumentAnalysisRequest(
        document_ref=DriveFileRef(file_id="dev-upload"),
        expected_document_type=job.expected_document_type,
        metadata=job.metadata,
        internal_prompt_key=job.internal_prompt_key,
    )

    provider = get_provider()
    result = provider.analyze(
        analysis_request,
        document_bytes=document_bytes,
        mime_type=job.mime_type,
    )
    if job.matched_by_filename is False:
        result.warnings.append(
            "No se reconocio el tipo de documento por el nombre del archivo; "
            "se uso clasificacion generica (menos confiable)."
        )

    job.status = AnalysisJob.COMPLETADO
    job.resultado = {
        "detected_document_type": result.detected_document_type,
        "matches_expected_type": result.matches_expected_type,
        "confidence": result.confidence,
        "extracted_data": result.extracted_data,
        "validation_errors": result.validation_errors,
        "warnings": result.warnings,
        "internal_prompt_key_used": job.internal_prompt_key,
        "matched_by_filename": job.matched_by_filename,
    }
    # Limpia cualquier error_mensaje que haya quedado de un intento previo
    # fallido (ejecutar_con_reintentos lo llena en PENDIENTE mientras
    # reintenta) - sin esto, un analisis que al final SI tuvo exito seguia
    # mostrando el mensaje viejo de "se reintentara automaticamente" junto
    # con el resultado bueno (hallazgo 14/Ago/2026, reporte de Mariana).
    job.error_mensaje = ""
    job.save(update_fields=["status", "resultado", "error_mensaje", "updated_at"])

    AnalysisRequestLog.objects.create(
        servicio_solicitante=job.servicio_solicitante,
        tipo_documento_esperado=job.expected_document_type,
        tipo_documento_detectado=result.detected_document_type,
        coincide_tipo_esperado=result.matches_expected_type,
        confianza=result.confidence,
        proveedor_usado="vertex-ai" if settings.DOCINT_USE_VERTEX else "ai-studio",
        errores_validacion=result.validation_errors,
        advertencias=result.warnings,
    )

    return job


def ejecutar_con_reintentos(job: AnalysisJob) -> bool:
    """Envoltura de ejecutar_analisis con la politica de reintentos de
    aplicacion (ver plan seccion 6): si algo revienta (infra, no un error de
    negocio ya manejado por el provider - ese vuelve en validation_errors sin
    lanzar excepcion, ver gemini_provider.py) y aun quedan intentos, deja el
    job en un estado reintentable y regresa False para que quien llamo
    (docint/tasks.py o el endpoint /procesar) le diga a Cloud Tasks que
    reintente (HTTP 500). Si ya se agotaron los intentos, marca ERROR de
    forma definitiva y regresa True (para que Cloud Tasks NO seguir
    reintentando - ya no hay nada mas que hacer)."""

    try:
        ejecutar_analisis(job)
        return True
    except Exception as exc:  # noqa: BLE001 - fallo de infraestructura al analizar
        job.refresh_from_db(fields=["intentos"])
        if job.intentos < job.max_intentos:
            job.status = AnalysisJob.PENDIENTE
            job.error_mensaje = str(exc)
            job.save(update_fields=["status", "error_mensaje", "updated_at"])
            return False

        job.status = AnalysisJob.ERROR
        job.error_mensaje = (
            "No se pudo analizar el documento despues de varios intentos. "
            "El servicio de analisis no esta disponible en este momento, intenta de nuevo mas tarde."
        )
        job.save(update_fields=["status", "error_mensaje", "updated_at"])
        return True
