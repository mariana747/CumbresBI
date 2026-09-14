from decimal import Decimal

from cumbresbi_scope.permissions import require_permission
from django.db.models import IntegerField, Sum
from django.db.models.functions import Cast
from django.utils import timezone
from rest_framework.decorators import action
from rest_framework.filters import SearchFilter
from rest_framework.response import Response
from rest_framework.viewsets import ModelViewSet

from .models import (
    ObraConcepto,
    ObraCorteSemanal,
    ObraCorteSemanalDetalle,
    ObraEstimacion,
    ObraEtapa,
    ObraEvidencia,
    ObraLote,
)
from .serializers import (
    ObraConceptoSerializer,
    ObraCorteSemanalDetalleSerializer,
    ObraCorteSemanalSerializer,
    ObraEstimacionSerializer,
    ObraEtapaSerializer,
    ObraEvidenciaSerializer,
    ObraLoteSerializer,
)


class _PermisosObraMixin:
    """Mismo gate de permisos en todos los recursos de este primer corte:
    crear=obra.crear, editar/borrar=obra.editar, lectura abierta - mismo
    criterio que _PermisosCatalogoTesoreriaMixin en tesoreria-service."""

    def get_permissions(self):
        if self.action == "create":
            return [require_permission("obra.crear")()]
        if self.action in ("update", "partial_update", "destroy"):
            return [require_permission("obra.editar")()]
        return super().get_permissions()


class ObraEtapaViewSet(_PermisosObraMixin, ModelViewSet):
    """Catalogo fijo de etapas (una fila por hoja del Excel legado) -
    compartido entre proyectos, sin ScopedManager (mismo criterio que
    TesoreriaBanco)."""

    queryset = ObraEtapa.objects.all()
    serializer_class = ObraEtapaSerializer
    filter_backends = [SearchFilter]
    search_fields = ["nombre"]


class ObraConceptoViewSet(_PermisosObraMixin, ModelViewSet):
    """Conceptos/actividades dentro de una etapa (ej. "1.1 Albañilerias").
    Mismo criterio de permisos que ObraEtapa."""

    queryset = ObraConcepto.objects.select_related("etapa").all()
    serializer_class = ObraConceptoSerializer
    filter_backends = [SearchFilter]
    search_fields = ["numero", "descripcion", "maestro"]


class ObraLoteViewSet(_PermisosObraMixin, ModelViewSet):
    """Lotes/casas de un proyecto - primer recurso de este servicio con
    alcance real por proyecto (ScopedManager, ver models.py)."""

    serializer_class = ObraLoteSerializer
    filter_backends = [SearchFilter]
    search_fields = ["numero_lote", "manzana", "obra"]

    def get_queryset(self):
        # numero_lote es CharField (mismo criterio que el resto del ERD,
        # ver models.py) - ordenar por texto pondria "10" antes de "2".
        # Cast a entero para el orden real (1, 2, 3... 41), no lexicografico.
        return (
            ObraLote.objects.for_scope(self.request.effective_scope)
            .annotate(numero_lote_int=Cast("numero_lote", IntegerField()))
            .order_by("proyecto", "manzana", "numero_lote_int")
        )


class ObraEstimacionViewSet(_PermisosObraMixin, ModelViewSet):
    """Captura diaria de avance (fila hija del Excel) - la actualizacion es
    continua/en vivo, sin validacion manual en este paso (esa validacion
    ocurre a nivel de ObraCorteSemanal, no aqui, ver su docstring).

    `numero_estimacion` se calcula aqui (siguiente consecutivo 1-4 dentro
    del concepto+lote), mismo criterio que TesoreriaContrato.id_contrato
    generado en perform_create en vez de dejarlo a mano del cliente.

    31/Ago/2026 (corregido tras auditoria de scope): get_queryset() usaba
    `.all()` sin RLS pese a que ObraLote (via `lote`) ya tenia
    SCOPE_FIELD_PROYECTO - cualquiera con permiso de obra veia el avance
    de TODOS los proyectos. Ahora hereda el scope del lote."""

    serializer_class = ObraEstimacionSerializer
    filter_backends = [SearchFilter]
    search_fields = ["concepto__descripcion", "lote__numero_lote"]

    def get_queryset(self):
        return (
            ObraEstimacion.objects.for_scope(self.request.effective_scope)
            .select_related("concepto", "lote")
            .order_by("-fecha_captura")
        )

    def perform_create(self, serializer):
        concepto = serializer.validated_data["concepto"]
        lote = serializer.validated_data["lote"]
        numero_estimacion = (
            ObraEstimacion.objects.filter(concepto=concepto, lote=lote).count() + 1
        )
        serializer.save(numero_estimacion=numero_estimacion)


class ObraEvidenciaViewSet(_PermisosObraMixin, ModelViewSet):
    """Foto de evidencia por concepto+lote - `link_drive` se captura a mano
    (URL pegada) mientras no exista la Unidad compartida de Drive para
    Obra (ver docstring del modelo). `revisar` marca la evidencia como
    revisada por el Supervisor de Obra, mismo criterio de segregacion
    captura/revision que ObraCorteSemanal.aprobar.

    31/Ago/2026: mismo fix de scope que ObraEstimacionViewSet arriba
    (`.all()` -> `.for_scope()`, via `lote__proyecto`)."""

    serializer_class = ObraEvidenciaSerializer
    filter_backends = [SearchFilter]
    search_fields = ["concepto__descripcion", "lote__numero_lote"]

    def get_queryset(self):
        return (
            ObraEvidencia.objects.for_scope(self.request.effective_scope)
            .select_related("concepto", "lote")
            .order_by("-fecha_captura")
        )

    @action(detail=True, methods=["post"])
    def revisar(self, request, pk=None):
        revisado_por = request.data.get("revisado_por")
        if not revisado_por:
            return Response({"revisado_por": ["Este campo es requerido."]}, status=400)

        evidencia = self.get_object()
        evidencia.revisado = True
        evidencia.revisado_por = revisado_por
        evidencia.revisado_en = timezone.now()
        evidencia.save(update_fields=["revisado", "revisado_por", "revisado_en", "updated_at"])
        return Response(ObraEvidenciaSerializer(evidencia).data)

    def get_permissions(self):
        if self.action == "revisar":
            return [require_permission("obra.aprobar")()]
        return super().get_permissions()


class ObraCorteSemanalViewSet(_PermisosObraMixin, ModelViewSet):
    """Snapshot del corte de cada viernes - el estado inicial es BORRADOR;
    pasar a APROBADO requiere la accion explicita `aprobar` (permiso
    obra.aprobar), nunca automatico por fecha/cron (ver models.py)."""

    serializer_class = ObraCorteSemanalSerializer
    filter_backends = [SearchFilter]
    search_fields = ["proyecto"]

    def get_queryset(self):
        return ObraCorteSemanal.objects.for_scope(self.request.effective_scope).order_by("-fecha_corte")

    @action(detail=True, methods=["post"])
    def aprobar(self, request, pk=None):
        """Cierra el corte de la semana (Supervisor de Obra) y CONGELA un
        snapshot real del % acumulado de cada concepto+lote del proyecto
        en ese momento (ObraCorteSemanalDetalle) - antes este corte era
        solo metadata, no un snapshot de verdad (21/Ago/2026, hallazgo de
        Mariana: "si alguien sigue editando estimaciones despues de
        aprobar, el corte aprobado ya no refleja lo que se envio").
        Idempotente: si ya tiene detalle (se re-aprueba por error), no
        duplica filas - primero borra el detalle previo.

        `aprobado_por` viene en el body, no de effective_scope (todavia no
        hay JWT real que resuelva el user_id del actor aqui) - mismo
        criterio que PldContraparteKycViewSet.aprobar en pld-service."""
        aprobado_por = request.data.get("aprobado_por")
        if not aprobado_por:
            return Response({"aprobado_por": ["Este campo es requerido."]}, status=400)

        corte = self.get_object()

        # Acumulado real por concepto+lote AHORA MISMO, solo de lotes del
        # proyecto de este corte - es la foto que se congela.
        acumulados = (
            ObraEstimacion.objects.filter(lote__proyecto=corte.proyecto)
            .values("concepto_id", "lote_id")
            .annotate(total=Sum("porcentaje"))
        )

        corte.detalles.all().delete()
        ObraCorteSemanalDetalle.objects.bulk_create(
            [
                ObraCorteSemanalDetalle(
                    corte=corte,
                    concepto_id=fila["concepto_id"],
                    lote_id=fila["lote_id"],
                    porcentaje_acumulado=fila["total"] or Decimal("0"),
                )
                for fila in acumulados
            ]
        )

        corte.estado = ObraCorteSemanal.ESTADO_APROBADO
        corte.aprobado_por = aprobado_por
        corte.aprobado_en = timezone.now()
        corte.save(update_fields=["estado", "aprobado_por", "aprobado_en", "updated_at"])
        return Response(ObraCorteSemanalSerializer(corte).data)

    @action(detail=True, methods=["get"])
    def detalle(self, request, pk=None):
        """Consulta el snapshot ya congelado (vacio si el corte sigue en
        BORRADOR/EN_REVISION - el detalle solo existe despues de
        aprobar())."""
        corte = self.get_object()
        detalles = corte.detalles.select_related("concepto", "lote").order_by("concepto__numero", "lote__numero_lote")
        return Response(ObraCorteSemanalDetalleSerializer(detalles, many=True).data)

    def get_permissions(self):
        if self.action == "aprobar":
            return [require_permission("obra.aprobar")()]
        return super().get_permissions()
