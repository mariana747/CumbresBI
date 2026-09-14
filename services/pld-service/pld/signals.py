"""Workflow hibrido de estado_llenado (decision de Mariana, 12/Ago/2026, ver
docs/architecture/pld-fase2-alcance.md sec. 3): el estado del expediente se
recalcula solo a partir del status de sus documentos, salvo que el analista
ya lo haya sobreescrito a mano (PldContraparteKyc.estado_llenado_manual).

No hay catalogo de "documentos requeridos" en el modelo (PldContraparteDoc
es de denominacion libre, ver models.py) - se recalcula sobre los documentos
que YA existen para ese expediente, no contra una lista fija esperada.
"""
from django.db.models.signals import post_delete, post_save
from django.dispatch import receiver

from .models import PldContraparteDoc, PldContraparteKyc


def recalcular_estado_llenado(kyc: PldContraparteKyc) -> None:
    """Recalcula y guarda estado_llenado de `kyc` segun el status de sus
    documentos - no hace nada si estado_llenado_manual esta en True (el
    analista ya tomo el control manual de este campo).

    Refresca estado_llenado/estado_llenado_manual desde la BD antes de
    decidir: `kyc` puede ser un objeto en memoria desactualizado (ej. un
    FK ya cacheado desde antes de un PATCH reciente, via
    PldContraparteDoc.kyc) - sin este refresh, un override manual reciente
    podria no verse todavia y el recalculo automatico lo pisaria."""
    kyc.refresh_from_db(fields=["estado_llenado", "estado_llenado_manual"])
    if kyc.estado_llenado_manual:
        return

    documentos = list(kyc.documentos.all())
    if not documentos:
        nuevo_estado = PldContraparteKyc.ESTADO_PENDIENTE
    elif all(
        d.status in (PldContraparteDoc.STATUS_ENTREGADO, PldContraparteDoc.STATUS_APROBADO)
        for d in documentos
    ):
        nuevo_estado = PldContraparteKyc.ESTADO_ENTREGADO
    else:
        nuevo_estado = PldContraparteKyc.ESTADO_INCOMPLETO

    if nuevo_estado != kyc.estado_llenado:
        kyc.estado_llenado = nuevo_estado
        kyc.save(update_fields=["estado_llenado"])


@receiver(post_save, sender=PldContraparteDoc)
def _doc_guardado(sender, instance, **kwargs):
    recalcular_estado_llenado(instance.kyc)


@receiver(post_delete, sender=PldContraparteDoc)
def _doc_borrado(sender, instance, **kwargs):
    # instance.kyc puede fallar si el borrado fue en cascada por borrar el
    # propio kyc (on_delete=CASCADE, ver models.py) - en ese caso no hay
    # nada que recalcular, el expediente ya no existe.
    try:
        kyc = instance.kyc
    except PldContraparteKyc.DoesNotExist:
        return
    recalcular_estado_llenado(kyc)
