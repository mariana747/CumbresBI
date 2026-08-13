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

from django.conf import settings

from .models import AnalysisJob


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
    """Modo dev: corre el analisis de inmediato, sin pasar por una cola real
    ni por el endpoint /procesar (que sigue existiendo para cuando
    DOCINT_TASKS_ENABLED=True). Aplica el mismo manejo de reintentos/errores
    que usaria /procesar via Cloud Tasks - ver processing.ejecutar_con_reintentos,
    compartida para no duplicar la logica.

    ejecutar_con_reintentos regresa False cuando el fallo fue transitorio y
    aun quedan intentos - en produccion eso lo resuelve Cloud Tasks
    reentregando la tarea; aqui no hay cola que lo haga, asi que se reintenta
    en el momento con un backoff corto para no dejar el job atorado en
    PENDIENTE para siempre."""
    import time

    from .processing import ejecutar_con_reintentos

    job = AnalysisJob.objects.get(id=job_id)
    while not ejecutar_con_reintentos(job):
        time.sleep(1.5)
