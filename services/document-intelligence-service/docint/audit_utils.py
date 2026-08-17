import logging

import requests
from django.conf import settings
from django.utils import timezone

logger = logging.getLogger(__name__)

# Timeout corto a proposito: este es un side-effect de auditoria, nunca debe
# demorar ni tumbar el analisis real. Mismo criterio que
# iam-service/iam/audit_utils.py::emitir_evento_auditoria.
_TIMEOUT_SEGUNDOS = 2


def emitir_evento_auditoria(
    accion: str,
    entidad: str,
    entidad_id: str,
    *,
    actor_user_id: str | None = None,
    valores_previos: dict | None = None,
    valores_nuevos: dict | None = None,
):
    """Registra un evento en la bitacora central (audit-service) - mismo
    endpoint y contrato que iam-service/iam/audit_utils.py (duplicado a
    proposito, no compartido via cumbresbi_scope: es integracion de muy bajo
    nivel especifica de cada servicio, igual criterio que las plantillas de
    correo duplicadas en pld-service/iam-service).

    No propaga la excepcion si audit-service no responde - un fallo de
    auditoria no debe tumbar el analisis de documentos en si."""
    try:
        requests.post(
            f"{settings.AUDIT_SERVICE_URL}/api/bitacora/registrar_evento/",
            json={
                "servicio_origen": "document-intelligence-service",
                "actor_user_id": actor_user_id,
                "accion": accion,
                "entidad": entidad,
                "entidad_id": entidad_id,
                "valores_previos": valores_previos,
                "valores_nuevos": valores_nuevos,
                "ocurrido_en": timezone.now().isoformat(),
            },
            timeout=_TIMEOUT_SEGUNDOS,
        )
    except requests.RequestException:
        logger.warning("No se pudo registrar el evento de auditoria '%s' para %s", accion, entidad_id)
