import logging

import requests
from django.conf import settings
from django.utils import timezone

logger = logging.getLogger(__name__)

# Timeout corto a proposito: este es un side-effect de auditoria, nunca debe
# demorar ni tumbar la respuesta al usuario de la operacion real (crear/usar/
# revocar un magic link). Ver docstring de registrar_evento en
# audit-service/auditoria/views.py - llamada sincrona interina mientras no
# exista Pub/Sub real (docs/architecture/README.md sec. 9).
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
    """Registra un evento en la bitacora central (audit-service).

    No propaga la excepcion ni el status de error - un fallo de auditoria
    no debe tumbar la operacion de negocio real. Se registra en el log
    local de iam-service para poder detectar el hueco despues (ver riesgo
    documentado en README.md sec. 9: "un relay caido es un hueco de
    auditoria silencioso"), tanto si falla la red como si audit-service
    rechaza el evento con un 4xx/5xx - antes solo se atrapaba
    RequestException y un rechazo por status se perdia sin dejar rastro
    (18/Ago/2026, ver pld-service/pld/audit_utils.py, mismo hallazgo).
    """
    try:
        response = requests.post(
            f"{settings.AUDIT_SERVICE_URL}/api/bitacora/registrar_evento/",
            json={
                "servicio_origen": "iam-service",
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
        return

    if not response.ok:
        logger.warning(
            "audit-service rechazo el evento de auditoria '%s' para %s (status %s): %s",
            accion, entidad_id, response.status_code, response.text[:500],
        )
