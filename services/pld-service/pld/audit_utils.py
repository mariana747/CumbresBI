import logging

import requests
from django.conf import settings
from django.utils import timezone

logger = logging.getLogger(__name__)

# Timeout corto a proposito: este es un side-effect de auditoria, nunca debe
# demorar ni tumbar la operacion real del Motor Documental. Mismo criterio que
# document-intelligence-service/docint/audit_utils.py::emitir_evento_auditoria
# e iam-service/iam/audit_utils.py (duplicado a proposito, no compartido via
# cumbresbi_scope: integracion de muy bajo nivel especifica de cada servicio).
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
    no debe tumbar la operacion del expediente KYC en si. Se loguea en
    ambos casos (red caida O audit-service rechazando el evento, ej. un
    actor_user_id mas largo que la columna) para no perder el hueco en
    silencio - antes solo se atrapaba RequestException, un 4xx/5xx de
    audit-service se perdia sin dejar rastro (18/Ago/2026, hallazgo real
    durante pruebas: un actor_user_id de prueba mas largo de 8 caracteres
    fallo en audit-service y aqui no quedo ningun log)."""
    try:
        response = requests.post(
            f"{settings.AUDIT_SERVICE_URL}/api/bitacora/registrar_evento/",
            json={
                "servicio_origen": "pld-service",
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


def contexto_kyc(kyc) -> dict:
    """Contexto estandar del expediente KYC para incluir en valores_nuevos/
    valores_previos, para que el frontend de auditoria lo pueda mostrar sin
    tener que parsear JSON libre. Mismas llaves en todas las acciones de
    pld-service."""
    return {
        "id_contraparte": kyc.id_contraparte,
        "sociedad_rfc": kyc.sociedad_rfc,
        "nombre_completo": kyc.nombre_completo,
    }
