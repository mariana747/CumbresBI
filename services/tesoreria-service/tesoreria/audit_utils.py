import logging

import requests
from django.conf import settings
from django.utils import timezone

logger = logging.getLogger(__name__)

# Timeout corto a proposito: este es un side-effect de auditoria, nunca debe
# demorar ni tumbar la operacion real de Tesoreria. Mismo criterio que
# pld-service/pld/audit_utils.py::emitir_evento_auditoria (duplicado a
# proposito, no compartido via cumbresbi_scope: integracion de muy bajo
# nivel especifica de cada servicio). Cierra el hallazgo de 24/Ago/2026
# documentado en TesoreriaFacturaViewSet.confirmar_extraccion (docs/
# CumbresBI_estado.md) - tesoreria-service no tenia audit_utils.py.
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
    no debe tumbar la operacion real de Tesoreria. Se loguea en ambos casos
    (red caida O audit-service rechazando el evento) para no perder el
    hueco en silencio, mismo criterio que pld-service."""
    try:
        response = requests.post(
            f"{settings.AUDIT_SERVICE_URL}/api/bitacora/registrar_evento/",
            json={
                "servicio_origen": "tesoreria-service",
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
