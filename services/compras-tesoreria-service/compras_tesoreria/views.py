from decimal import Decimal, InvalidOperation

from cumbresbi_scope.permissions import require_permission
from django.db import transaction
from django.db.models import F
from django.utils import timezone
from rest_framework.decorators import action
from rest_framework.filters import SearchFilter
from rest_framework.response import Response
from rest_framework.viewsets import ModelViewSet, ReadOnlyModelViewSet

from .models import (
    Cotizacion,
    CotizacionLinea,
    OrdenCompra,
    OrdenCompraLinea,
    Recepcion,
    RecepcionLinea,
    SolicitudCompra,
)
from .serializers import (
    CotizacionSerializer,
    OrdenCompraSerializer,
    RecepcionSerializer,
    SolicitudCompraSerializer,
)


def _actor(request):
    return getattr(request.effective_scope, "identity_user_id", None) or "sistema"


class _PermisosComprasMixin:
    """Mismo gate de permisos en todos los recursos de este primer corte:
    crear=compras.crear, editar/borrar=compras.editar, lectura abierta -
    mismo criterio que _PermisosMaterialesMixin en materiales-service.
    Las acciones que deciden (generar orden, confirmar extraccion de la
    IA) piden compras.aprobar por separado, ver cada ViewSet."""

    def get_permissions(self):
        if self.action == "create":
            return [require_permission("compras.crear")()]
        if self.action in ("update", "partial_update", "destroy"):
            return [require_permission("compras.editar")()]
        return super().get_permissions()


class SolicitudCompraViewSet(_PermisosComprasMixin, ModelViewSet):
    """Cabecera del proceso de compra - puede o no venir de una Requisicion
    ya autorizada de materiales-service (`requisicion`, referencia laxa,
    ver docstring del modelo)."""

    serializer_class = SolicitudCompraSerializer
    filter_backends = [SearchFilter]
    search_fields = ["proyecto", "descripcion", "requisicion"]

    def get_queryset(self):
        queryset = (
            SolicitudCompra.objects.for_scope(self.request.effective_scope)
            .prefetch_related("cotizaciones", "cotizaciones__lineas")
            .order_by("-created_at")
        )
        proyecto = self.request.query_params.get("proyecto")
        if proyecto:
            queryset = queryset.filter(proyecto=proyecto)
        return queryset

    def perform_create(self, serializer):
        actor = _actor(self.request)
        serializer.save(solicitado_por=actor, created_by=actor, updated_by=actor)

    def perform_update(self, serializer):
        serializer.save(updated_by=_actor(self.request))


class CotizacionViewSet(_PermisosComprasMixin, ModelViewSet):
    """Cotizacion de un proveedor contra una SolicitudCompra.
    confirmar_extraccion es el enlace real con el Motor Documental
    (prompt "compras.cotizacion" de docint/prompts.py, ya existia sin
    consumidor real) - mismo patron "la IA propone, un humano confirma"
    que TesoreriaFlujoViewSet.confirmar_conciliacion en tesoreria-service:
    el frontend ya llamo a docint AnalyzeView por su cuenta y dejo que el
    analista revise/corrija en pantalla, esta accion solo guarda lo ya
    confirmado."""

    serializer_class = CotizacionSerializer
    filter_backends = [SearchFilter]
    search_fields = ["proveedor_nombre"]

    # Whitelist de columnas que confirmar_extraccion puede escribir - mismo
    # criterio que TesoreriaFacturaViewSet.CAMPOS_CONFIRMABLES: la IA
    # propone, un humano ya reviso/corrigio en pantalla antes de este POST.
    CAMPOS_CONFIRMABLES = {
        "proveedor_nombre",
        "fecha_cotizacion",
        "vigencia_dias",
        "moneda",
        "subtotal",
        "iva",
        "total",
        "link_drive",
        "comentarios",
    }

    def get_queryset(self):
        queryset = (
            Cotizacion.objects.for_scope(self.request.effective_scope)
            .select_related("solicitud")
            .prefetch_related("lineas")
            .order_by("-created_at")
        )
        solicitud = self.request.query_params.get("solicitud")
        if solicitud:
            queryset = queryset.filter(solicitud_id=solicitud)
        return queryset

    def perform_create(self, serializer):
        actor = _actor(self.request)
        solicitud = serializer.validated_data["solicitud"]
        serializer.save(created_by=actor, updated_by=actor)
        if solicitud.estado == SolicitudCompra.ESTADO_PENDIENTE:
            solicitud.estado = SolicitudCompra.ESTADO_EN_COTIZACION
            solicitud.updated_by = actor
            solicitud.save(update_fields=["estado", "updated_by", "updated_at"])

    def perform_update(self, serializer):
        serializer.save(updated_by=_actor(self.request))

    def get_permissions(self):
        if self.action == "confirmar_extraccion":
            return [require_permission("compras.aprobar")()]
        return super().get_permissions()

    @action(detail=True, methods=["post"])
    def confirmar_extraccion(self, request, pk=None):
        """Body:
        - "campos": {<nombre_de_campo>: <valor>, ...} - solo se aceptan
          campos en CAMPOS_CONFIRMABLES.
        - "lineas": [{"descripcion", "cantidad", "precio_unitario",
          "importe"}, ...] - reemplaza TODAS las lineas existentes de esta
          cotizacion (snapshot completo de lo que la IA extrajo/el
          analista ya corrigio en pantalla, no un merge parcial)."""
        cotizacion = self.get_object()
        actor = _actor(request)

        campos = request.data.get("campos") or {}
        if campos and not isinstance(campos, dict):
            return Response({"detail": "'campos' debe ser un objeto."}, status=400)
        datos_validos = {k: v for k, v in campos.items() if k in self.CAMPOS_CONFIRMABLES}

        lineas = request.data.get("lineas")
        if lineas is not None and not isinstance(lineas, list):
            return Response({"lineas": ["Debe ser una lista."]}, status=400)

        with transaction.atomic():
            if datos_validos:
                serializer = self.get_serializer(cotizacion, data=datos_validos, partial=True)
                serializer.is_valid(raise_exception=True)
                serializer.save(updated_by=actor)
            if lineas is not None:
                cotizacion.lineas.all().delete()
                for linea in lineas:
                    CotizacionLinea.objects.create(
                        cotizacion=cotizacion,
                        descripcion=linea.get("descripcion") or "",
                        cantidad=linea.get("cantidad") or 0,
                        precio_unitario=linea.get("precio_unitario") or 0,
                        importe=linea.get("importe") or 0,
                    )
            cotizacion.estado = Cotizacion.ESTADO_CONFIRMADA
            cotizacion.updated_by = actor
            cotizacion.save(update_fields=["estado", "updated_by", "updated_at"])

        cotizacion.refresh_from_db()
        return Response(self.get_serializer(cotizacion).data)


class OrdenCompraViewSet(_PermisosComprasMixin, ReadOnlyModelViewSet):
    """Orden de compra - de solo lectura (list/retrieve) via el CRUD
    normal; no se crea/edita/borra a mano: nace completa de
    generar_desde_cotizacion, mismo criterio de "documento generado, no
    capturado" que Requisicion en materiales-service."""

    serializer_class = OrdenCompraSerializer
    filter_backends = [SearchFilter]
    search_fields = ["folio", "proveedor_nombre"]

    def get_queryset(self):
        queryset = (
            OrdenCompra.objects.for_scope(self.request.effective_scope)
            .select_related("solicitud", "cotizacion")
            .prefetch_related("lineas")
            .order_by("-created_at")
        )
        proyecto = self.request.query_params.get("proyecto")
        if proyecto:
            queryset = queryset.filter(proyecto=proyecto)
        return queryset

    def get_permissions(self):
        if self.action == "generar_desde_cotizacion":
            return [require_permission("compras.aprobar")()]
        return super().get_permissions()

    @action(detail=False, methods=["post"])
    def generar_desde_cotizacion(self, request):
        """Genera la orden a partir de la cotizacion elegida como ganadora:
        marca esa cotizacion GANADORA y descarta las demas de la misma
        solicitud, crea la orden + snapshot de lineas, avanza
        SolicitudCompra a ORDEN_GENERADA. Body: {"cotizacion": <id>}."""
        cotizacion_id = request.data.get("cotizacion")
        if not cotizacion_id:
            return Response({"cotizacion": ["Este campo es requerido."]}, status=400)
        try:
            cotizacion = (
                Cotizacion.objects.for_scope(request.effective_scope)
                .select_related("solicitud")
                .prefetch_related("lineas")
                .get(pk=cotizacion_id)
            )
        except Cotizacion.DoesNotExist:
            return Response({"cotizacion": ["No existe esa cotización."]}, status=404)

        if cotizacion.estado not in (Cotizacion.ESTADO_PENDIENTE_REVISION, Cotizacion.ESTADO_CONFIRMADA):
            return Response({"detail": "Esa cotización ya fue usada o descartada."}, status=400)

        solicitud = cotizacion.solicitud
        actor = _actor(request)

        with transaction.atomic():
            cotizacion.estado = Cotizacion.ESTADO_GANADORA
            cotizacion.updated_by = actor
            cotizacion.save(update_fields=["estado", "updated_by", "updated_at"])
            solicitud.cotizaciones.exclude(pk=cotizacion.pk).exclude(
                estado=Cotizacion.ESTADO_DESCARTADA
            ).update(estado=Cotizacion.ESTADO_DESCARTADA, updated_by=actor)

            folio = f"OC-{solicitud.proyecto}-{timezone.now().strftime('%y%m%d')}-{cotizacion.id_cotizacion[:6].upper()}"
            orden = OrdenCompra.objects.create(
                folio=folio,
                proyecto=solicitud.proyecto,
                solicitud=solicitud,
                cotizacion=cotizacion,
                proveedor=cotizacion.proveedor,
                proveedor_nombre=cotizacion.proveedor_nombre,
                monto_total=cotizacion.total or 0,
                autorizado_por=actor,
                created_by=actor,
                updated_by=actor,
            )
            for linea in cotizacion.lineas.all():
                OrdenCompraLinea.objects.create(
                    orden=orden,
                    descripcion=linea.descripcion,
                    cantidad=linea.cantidad,
                    precio_unitario=linea.precio_unitario,
                    importe=linea.importe,
                )

            solicitud.estado = SolicitudCompra.ESTADO_ORDEN_GENERADA
            solicitud.updated_by = actor
            solicitud.save(update_fields=["estado", "updated_by", "updated_at"])

        return Response(self.get_serializer(orden).data, status=201)


class RecepcionViewSet(_PermisosComprasMixin, ModelViewSet):
    """Bitacora de recepcion de mercancia contra una OrdenCompra - puede
    haber varias entradas por orden (entregas parciales). `create` valida
    cada linea contra lo que falta por recibir y acumula
    OrdenCompraLinea.cantidad_recibida con select_for_update (mismo
    criterio anti-condicion-de-carrera que SolicitudMaterialViewSet.
    entregar en materiales-service)."""

    serializer_class = RecepcionSerializer
    filter_backends = [SearchFilter]
    search_fields = ["orden__folio"]
    http_method_names = ["get", "post", "head", "options"]

    def get_queryset(self):
        queryset = (
            Recepcion.objects.for_scope(self.request.effective_scope)
            .select_related("orden")
            .prefetch_related("lineas")
            .order_by("-fecha", "-hora")
        )
        orden = self.request.query_params.get("orden")
        if orden:
            queryset = queryset.filter(orden_id=orden)
        return queryset

    def create(self, request, *args, **kwargs):
        lineas = request.data.get("lineas")
        if not isinstance(lineas, list) or not lineas:
            return Response({"lineas": ["Se requiere al menos una línea recibida."]}, status=400)

        serializer = self.get_serializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        actor = _actor(request)

        with transaction.atomic():
            orden = OrdenCompra.objects.select_for_update().get(pk=serializer.validated_data["orden"].pk)
            recepcion = serializer.save(recibido_por=actor, created_by=actor, updated_by=actor, orden=orden)

            for linea in lineas:
                orden_linea_id = linea.get("orden_linea")
                try:
                    cantidad_recibida = Decimal(str(linea.get("cantidad_recibida")))
                except (InvalidOperation, TypeError):
                    return Response({"lineas": ["'cantidad_recibida' inválida."]}, status=400)
                try:
                    orden_linea = OrdenCompraLinea.objects.select_for_update().get(
                        pk=orden_linea_id, orden=orden
                    )
                except OrdenCompraLinea.DoesNotExist:
                    return Response(
                        {"lineas": [f"La línea '{orden_linea_id}' no pertenece a esta orden."]}, status=400
                    )
                pendiente = orden_linea.cantidad - orden_linea.cantidad_recibida
                if cantidad_recibida is None or cantidad_recibida <= 0 or cantidad_recibida > pendiente:
                    return Response(
                        {
                            "lineas": [
                                f"'{orden_linea.descripcion}': cantidad inválida, quedan {pendiente} por recibir."
                            ]
                        },
                        status=400,
                    )
                RecepcionLinea.objects.create(
                    recepcion=recepcion, orden_linea=orden_linea, cantidad_recibida=cantidad_recibida
                )
                orden_linea.cantidad_recibida += cantidad_recibida
                orden_linea.save(update_fields=["cantidad_recibida"])

            if orden.lineas.filter(cantidad_recibida__lt=F("cantidad")).exists():
                orden.estado = OrdenCompra.ESTADO_RECIBIDA_PARCIAL
            else:
                orden.estado = OrdenCompra.ESTADO_RECIBIDA_TOTAL
            orden.updated_by = actor
            orden.save(update_fields=["estado", "updated_by", "updated_at"])

        recepcion.refresh_from_db()
        return Response(self.get_serializer(recepcion).data, status=201)
