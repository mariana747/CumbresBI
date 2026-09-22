import logging
from datetime import timedelta
from decimal import Decimal, InvalidOperation

import requests
from cumbresbi_scope import forward_auth_headers
from cumbresbi_scope.permissions import require_permission
from django.conf import settings
from django.db import transaction
from django.db.models import F
from django.utils import timezone
from rest_framework.decorators import action
from rest_framework.filters import SearchFilter
from rest_framework.permissions import BasePermission
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

logger = logging.getLogger(__name__)


def _actor(request):
    return getattr(request.effective_scope, "identity_user_id", None) or "sistema"


class _PermisosComprasMixin:
    """Gate de permisos: crear=compras.crear, editar/borrar=compras.editar,
    lectura abierta. Acciones que deciden piden compras.aprobar aparte."""

    def get_permissions(self):
        if self.action == "create":
            return [require_permission("compras.crear")()]
        if self.action in ("update", "partial_update", "destroy"):
            return [require_permission("compras.editar")()]
        return super().get_permissions()


class _PermiteSecretoInternoOComprasCrear(BasePermission):
    """Mismo patron que materiales-service/materiales/views.py::
    _PermiteSecretoInternoOMaterialesEditar - el secreto interno servicio-a-
    servicio (X-Internal-Secret, ver settings.COMPRAS_INTERNAL_SECRET) es
    una via ADICIONAL para que materiales-service pueda crear la
    SolicitudCompra al autorizar una Requisicion, sin que quien autoriza
    necesite el permiso compras.crear; nunca reemplaza el permiso normal
    para cualquier otro llamador."""

    message = "No tienes el permiso 'compras.crear' para hacer esto."

    def has_permission(self, request, view):
        secreto_configurado = settings.COMPRAS_INTERNAL_SECRET
        secreto_recibido = request.META.get("HTTP_X_INTERNAL_SECRET")
        if secreto_configurado and secreto_recibido == secreto_configurado:
            return True
        return require_permission("compras.crear")().has_permission(request, view)


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
        estado = self.request.query_params.get("estado")
        if estado:
            queryset = queryset.filter(estado=estado)
        return queryset

    def perform_create(self, serializer):
        actor = _actor(self.request)
        serializer.save(solicitado_por=actor, created_by=actor, updated_by=actor)

    def perform_update(self, serializer):
        serializer.save(updated_by=_actor(self.request))

    def get_permissions(self):
        if self.action == "crear_desde_requisicion":
            return [_PermiteSecretoInternoOComprasCrear()]
        return super().get_permissions()

    @action(detail=False, methods=["post"])
    def crear_desde_requisicion(self, request):
        """Crea (o regresa la ya existente) SolicitudCompra al autorizar una
        Requisicion en materiales-service (21/Sep/2026, "conectar
        `autorizar` con la creacion de Cotizacion en compras-tesoreria-
        service", ver Requisicion.__doc__ en ese servicio). Idempotente por
        `requisicion` - un reintento de red no crea una segunda Solicitud
        para la misma Requisicion.

        Body: {"requisicion": str (id_requisicion), "proyecto": str,
        "descripcion": str, "solicitado_por": str (opcional, actor que
        autorizo del lado de Materiales)}. No usa self.get_queryset()/
        effective_scope (esta llamada no trae sesion de un usuario real,
        ver _PermiteSecretoInternoOComprasCrear)."""
        requisicion_id = (request.data.get("requisicion") or "").strip()
        proyecto = (request.data.get("proyecto") or "").strip()
        descripcion = (request.data.get("descripcion") or "").strip()
        if not requisicion_id or not proyecto or not descripcion:
            return Response(
                {"detail": "Se requieren 'requisicion', 'proyecto' y 'descripcion'."}, status=400
            )

        existente = SolicitudCompra.objects.filter(requisicion=requisicion_id).first()
        if existente:
            return Response(SolicitudCompraSerializer(existente).data, status=200)

        actor = (request.data.get("solicitado_por") or "").strip() or "sistema"
        solicitud = SolicitudCompra.objects.create(
            proyecto=proyecto,
            requisicion=requisicion_id,
            descripcion=descripcion,
            solicitado_por=actor,
            created_by="sistema",
            updated_by="sistema",
        )
        return Response(SolicitudCompraSerializer(solicitud).data, status=201)


class CotizacionViewSet(_PermisosComprasMixin, ModelViewSet):
    """Cotizacion de un proveedor contra una SolicitudCompra.
    confirmar_extraccion es el enlace con el Motor Documental: la IA
    propone, un humano confirma en pantalla antes de este POST."""

    serializer_class = CotizacionSerializer
    filter_backends = [SearchFilter]
    search_fields = ["proveedor_nombre"]

    # Whitelist de columnas que confirmar_extraccion puede escribir - mismo
    # criterio que TesoreriaFacturaViewSet.CAMPOS_CONFIRMABLES: la IA
    # propone, un humano ya reviso/corrigio en pantalla antes de este POST.
    CAMPOS_CONFIRMABLES = {
        "proveedor_nombre",
        "proveedor_rfc",
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
        estado = self.request.query_params.get("estado")
        if estado:
            queryset = queryset.filter(estado=estado)
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

        lineas_creadas = []
        with transaction.atomic():
            if datos_validos:
                serializer = self.get_serializer(cotizacion, data=datos_validos, partial=True)
                serializer.is_valid(raise_exception=True)
                serializer.save(updated_by=actor)
            if lineas is not None:
                cotizacion.lineas.all().delete()
                for linea in lineas:
                    lineas_creadas.append(
                        CotizacionLinea.objects.create(
                            cotizacion=cotizacion,
                            descripcion=linea.get("descripcion") or "",
                            cantidad=linea.get("cantidad") or 0,
                            precio_unitario=linea.get("precio_unitario") or 0,
                            importe=linea.get("importe") or 0,
                        )
                    )
            cotizacion.estado = Cotizacion.ESTADO_CONFIRMADA
            cotizacion.updated_by = actor
            cotizacion.save(update_fields=["estado", "updated_by", "updated_at"])

        # Fuera de la transaccion a proposito - la cotizacion ya quedo
        # confirmada, un problema de red con materiales-service no debe
        # revertirla (ver _sincronizar_precio_cotizado.__doc__).
        for linea in lineas_creadas:
            _sincronizar_precio_cotizado(cotizacion, linea)

        cotizacion.refresh_from_db()
        return Response(self.get_serializer(cotizacion).data)

    def get_permissions(self):
        if self.action in ("confirmar_extraccion", "reagendar"):
            return [require_permission("compras.aprobar")()]
        return super().get_permissions()

    @action(detail=True, methods=["post"])
    def reagendar(self, request, pk=None):
        """Cuando una cotizacion ya vencio (22/Sep/2026, "no se bloquea,
        se debe reagendar, se debe volver a pedir") - crea una Cotizacion
        NUEVA para la misma SolicitudCompra, con el mismo proveedor pero
        SIN lineas/precios/vigencia (el analista sube un documento de
        cotizacion nuevo, no se copia el precio viejo que ya vencio). La
        vencida queda DESCARTADA, como registro historico."""
        vencida = self.get_object()

        with transaction.atomic():
            vencida.estado = Cotizacion.ESTADO_DESCARTADA
            vencida.updated_by = _actor(request)
            vencida.save(update_fields=["estado", "updated_by", "updated_at"])
            nueva = Cotizacion.objects.create(
                solicitud=vencida.solicitud,
                proveedor=vencida.proveedor,
                proveedor_nombre=vencida.proveedor_nombre,
                proveedor_rfc=vencida.proveedor_rfc,
                created_by=_actor(request),
                updated_by=_actor(request),
            )
        return Response(self.get_serializer(nueva).data, status=201)


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
        estado = self.request.query_params.get("estado")
        if estado:
            queryset = queryset.filter(estado=estado)
        return queryset

    def get_permissions(self):
        if self.action in ("generar_desde_cotizacion", "cerrar_con_faltante"):
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

        # Vigencia (22/Sep/2026, "las cotizaciones duran una semana") - solo
        # se puede validar si la cotizacion trae fecha_cotizacion; sin ella
        # no hay desde cuando contar y se deja pasar (mismo criterio laxo
        # que el resto de campos opcionales extraidos por IA).
        if cotizacion.fecha_cotizacion and cotizacion.vigencia_dias:
            vence = cotizacion.fecha_cotizacion + timedelta(days=cotizacion.vigencia_dias)
            if timezone.now().date() > vence:
                return Response(
                    {"detail": f"Esta cotización venció el {vence.isoformat()}, no se puede generar la Orden."},
                    status=400,
                )

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
                subtotal=cotizacion.subtotal,
                iva=cotizacion.iva,
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

    @action(detail=True, methods=["post"])
    def cerrar_con_faltante(self, request, pk=None):
        """Cierra una orden con RECIBIDA_PARCIAL cuando el faltante es
        definitivo (21/Sep/2026, "y que pasa si llega menos de lo
        esperado") - antes no habia forma de sacarla de "Recibida parcial"
        si el proveedor ya no iba a mandar el resto. Solo aplica a ordenes
        con al menos una recepcion ya registrada (RECIBIDA_PARCIAL); una
        orden sin nada recibido se cancela (estado CANCELADA), no se cierra
        con faltante."""
        orden = self.get_object()
        if orden.estado != OrdenCompra.ESTADO_RECIBIDA_PARCIAL:
            return Response(
                {"detail": "Solo se puede cerrar con faltante una orden en estado 'Recibida parcial'."}, status=400
            )
        orden.estado = OrdenCompra.ESTADO_CERRADA_CON_FALTANTE
        orden.updated_by = _actor(request)
        orden.save(update_fields=["estado", "updated_by", "updated_at"])
        return Response(self.get_serializer(orden).data)


def _llamar_materiales_service(endpoint, payload, contexto):
    """POST interno a materiales-service (X-Internal-Secret). Fail-open: un
    problema de red no debe revertir lo ya guardado en Compras."""
    if not settings.MATERIALES_INTERNAL_SECRET:
        return
    try:
        upstream = requests.post(
            f"{settings.MATERIALES_SERVICE_URL}/api/materiales/{endpoint}/",
            json=payload,
            headers={"X-Internal-Secret": settings.MATERIALES_INTERNAL_SECRET},
            timeout=10,
        )
    except requests.RequestException:
        logger.warning("materiales-service no respondio al sincronizar %s", contexto, exc_info=True)
        return
    if upstream.status_code != 200:
        logger.warning(
            "materiales-service rechazo la sincronizacion de %s: %s %s",
            contexto,
            upstream.status_code,
            upstream.text[:300],
        )


def _sincronizar_inventario_materiales(orden, orden_linea, cantidad_recibida):
    """Suma al inventario de Obra al registrar una recepcion; busca/crea el
    material por nombre, sin catalogo previo obligatorio."""
    _llamar_materiales_service(
        "recibir_compra",
        {
            "material_nombre": orden_linea.descripcion,
            "cantidad_recibida": str(cantidad_recibida),
            "precio_unitario": str(orden_linea.precio_unitario),
            "proveedor": orden.proveedor,
        },
        "la recepcion de compra",
    )


def _sincronizar_precio_cotizado(cotizacion, linea):
    """Actualiza precio_unitario/proveedor en MaterialCatalogo al confirmar
    una cotizacion. No es entrega real, no toca cantidad_disponible."""
    if not linea.precio_unitario:
        return
    _llamar_materiales_service(
        "actualizar_precio_cotizado",
        {
            "material_nombre": linea.descripcion,
            "precio_unitario": str(linea.precio_unitario),
            "proveedor": cotizacion.proveedor,
        },
        "el precio cotizado",
    )


class RecepcionViewSet(_PermisosComprasMixin, ModelViewSet):
    """Bitacora de recepcion de mercancia contra una OrdenCompra, puede
    haber varias entradas por orden. `create` valida cantidad pendiente y
    acumula con select_for_update para evitar condicion de carrera."""

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

        lineas_a_sincronizar = []
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
                lineas_a_sincronizar.append((orden_linea, cantidad_recibida))

            if orden.lineas.filter(cantidad_recibida__lt=F("cantidad")).exists():
                orden.estado = OrdenCompra.ESTADO_RECIBIDA_PARCIAL
            else:
                orden.estado = OrdenCompra.ESTADO_RECIBIDA_TOTAL
            orden.updated_by = actor
            orden.save(update_fields=["estado", "updated_by", "updated_at"])

        # Fuera de la transaccion a proposito - la recepcion en Compras ya
        # quedo guardada, un problema de red con materiales-service no debe
        # revertirla (ver _sincronizar_inventario_materiales.__doc__).
        for orden_linea, cantidad_recibida in lineas_a_sincronizar:
            _sincronizar_inventario_materiales(orden, orden_linea, cantidad_recibida)

        recepcion.refresh_from_db()
        return Response(self.get_serializer(recepcion).data, status=201)

    @action(detail=True, methods=["post"])
    def subir_evidencia(self, request, pk=None):
        """Evidencia fotografica real de una Recepcion (21/Sep/2026, "falta
        el componente de tomar fotos") - mismo patron que
        TesoreriaFlujoViewSet.subir_comprobante en tesoreria-service: sube a
        Drive via drive-service y guarda el link. Quien sube es el propio
        usuario autenticado (forward_auth_headers reenvia su sesion), no
        una llamada servicio-a-servicio - por eso no usa X-Internal-Secret."""
        recepcion = self.get_object()
        archivo = request.FILES.get("file")
        if not archivo:
            return Response({"detail": "Campo 'file' requerido"}, status=400)

        headers, cookies = forward_auth_headers(request)
        carpeta = f"Compras/Recepciones/{recepcion.id_recepcion}"
        try:
            upstream = requests.post(
                f"{settings.DRIVE_SERVICE_URL}/api/upload/",
                params={"perm": "compras.editar"},
                files={"file": (archivo.name, archivo.read(), archivo.content_type)},
                data={"carpeta": carpeta},
                headers=headers,
                cookies=cookies,
                timeout=30,
            )
        except requests.RequestException:
            logger.warning("drive-service no respondio al subir evidencia de %s", recepcion.id_recepcion, exc_info=True)
            return Response({"detail": "El servicio de Drive no respondió. Intenta de nuevo."}, status=502)

        if upstream.status_code != 201:
            return Response(
                upstream.json() if upstream.content else {"detail": "Error al subir a Drive"},
                status=upstream.status_code,
            )

        resultado = upstream.json()
        recepcion.link_drive = resultado["web_view_link"]
        recepcion.updated_by = _actor(request)
        recepcion.save(update_fields=["link_drive", "updated_by", "updated_at"])
        return Response(self.get_serializer(recepcion).data)
