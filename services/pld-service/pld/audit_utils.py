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

    No propaga la excepcion si audit-service no responde - un fallo de
    auditoria no debe tumbar la operacion del expediente KYC en si."""
    try:
        requests.post(
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
