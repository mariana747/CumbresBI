"""Encolado del analisis via Cloud Tasks (Fase 2 de la migracion async, ver
plan). DOCINT_TASKS_ENABLED=False (dev/Docker Compose, sin GCP real) ejecuta
el analisis in-process de inmediato en vez de encolar de verdad - mismo
patron que DOCINT_USE_VERTEX, para no depender de un proyecto GCP en
desarrollo local ni de un emulador de Cloud Tasks (limitado/inexistente,
ver plan seccion 11).

DOCINT_TASKS_ENABLED=True (Cloud Run real) crea una Cloud Task HTTP con un
token OIDC de una service account dedicada, apuntando de vuelta al propio
servicio (DOCINT_SELF_BASE_URL) - Cloud Tasks es quien la invoca despues,
no este proceso.
"""

import threading

from django.conf import settings

from .models import AnalysisJob

# Serializa el analisis in-process en dev (17/Ago/2026, ver bug reportado):
# MotorDocumentalDialog.tsx manda varios archivos con Promise.all sin limite
# de concurrencia, y sin este lock cada uno lanzaba su propio hilo que
# llamaba a Gemini de inmediato - con la API key gratuita de AI Studio
# (DOCINT_USE_VERTEX=False, cuota muy baja) eso saturaba el rate limit al
# instante (429/503 en varios documentos a la vez, con reintentos que
# tambien chocaban entre si). Un solo lock global es suficiente para dev
# (un worker Django, sin Cloud Tasks real) - en produccion (Cloud Tasks) la
# propia cola limita cuantas tareas corren a la vez (maxConcurrentDispatches).
_ANALYSIS_LOCK = threading.Lock()


def encolar_analisis(job_id: str) -> str:
    """Encola (o ejecuta in-process en dev) el analisis de un AnalysisJob ya
    persistido. Regresa el nombre/identificador de la tarea (para trazar en
    AnalysisJob.cloud_task_name), vacio en modo dev."""

    if not settings.DOCINT_TASKS_ENABLED:
        _ejecutar_in_process(job_id)
        return ""

    from google.cloud import tasks_v2

    client = tasks_v2.CloudTasksClient()
    parent = client.queue_path(
        settings.DOCINT_CLOUD_TASKS_PROJECT,
        settings.DOCINT_CLOUD_TASKS_LOCATION,
        settings.DOCINT_CLOUD_TASKS_QUEUE,
    )
    url = f"{settings.DOCINT_SELF_BASE_URL.rstrip('/')}/analyze/{job_id}/procesar"
    task = {
        "http_request": {
            "http_method": tasks_v2.HttpMethod.POST,
            "url": url,
            "oidc_token": {
                "service_account_email": settings.DOCINT_CLOUD_TASKS_SERVICE_ACCOUNT,
            },
        }
    }
    created = client.create_task(request={"parent": parent, "task": task})

    AnalysisJob.objects.filter(id=job_id).update(cloud_task_name=created.name)
    return created.name


def _ejecutar_in_process(job_id: str) -> None:
    """Modo dev: corre el analisis en un hilo aparte (fire-and-forget), sin
    pasar por una cola real ni por el endpoint /procesar (que sigue
    existiendo para cuando DOCINT_TASKS_ENABLED=True). Debe ser NO
    bloqueante (Fase 3, ver plan): AnalyzeView ya responde 202 de inmediato,
    igual que en produccion con Cloud Tasks - si esto bloqueara, dev
    tendria un comportamiento distinto al real y el polling nunca veria
    'PROCESANDO'.

    Aplica el mismo manejo de reintentos/errores que usaria /procesar via
    Cloud Tasks - ver processing.ejecutar_con_reintentos, compartida para no
    duplicar la logica. ejecutar_con_reintentos regresa False cuando el
    fallo fue transitorio y aun quedan intentos - en produccion eso lo
    resuelve Cloud Tasks reentregando la tarea; aqui no hay cola que lo
    haga, asi que se reintenta dentro del mismo hilo con un backoff corto."""
    import time

    from django.db import close_old_connections

    from .processing import ejecutar_con_reintentos

    def _run():
        try:
            with _ANALYSIS_LOCK:  # un analisis a la vez contra Gemini, ver comentario arriba
                job = AnalysisJob.objects.get(id=job_id)
                while not ejecutar_con_reintentos(job):
                    time.sleep(1.5)
        finally:
            close_old_connections()  # el hilo no reusa la conexion del request original

    threading.Thread(target=_run, daemon=True).start()
