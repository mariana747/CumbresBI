import uuid
from decimal import Decimal, InvalidOperation

from cumbresbi_scope.permissions import require_permission
from django.conf import settings
from django.db import transaction
from django.utils import timezone
from rest_framework.decorators import action
from rest_framework.filters import SearchFilter
from rest_framework.permissions import BasePermission
from rest_framework.response import Response
from rest_framework.viewsets import ModelViewSet

from .models import (
    ConceptoPresupuesto,
    EvidenciaRecepcion,
    ManoObraCatalogo,
    MaterialCatalogo,
    Presupuesto,
    PresupuestoFirma,
    Requisicion,
    RequisicionLinea,
    SolicitudMaterial,
)
from .serializers import (
    ConceptoPresupuestoSerializer,
    EvidenciaRecepcionSerializer,
    ManoObraCatalogoSerializer,
    MaterialCatalogoSerializer,
    PresupuestoFirmaSerializer,
    PresupuestoSerializer,
    RequisicionSerializer,
    SolicitudMaterialSerializer,
)


class _PermisosMaterialesMixin:
    """Mismo gate de permisos en todos los recursos de este primer corte:
    crear=materiales.crear, editar/borrar=materiales.editar, lectura
    abierta - mismo criterio que _PermisosObraMixin en obra-service."""

    def get_permissions(self):
        if self.action == "create":
            return [require_permission("materiales.crear")()]
        if self.action in ("update", "partial_update", "destroy"):
            return [require_permission("materiales.editar")()]
        return super().get_permissions()


class _PermiteSecretoInternoOMaterialesEditar(BasePermission):
    """Mismo patron que tesoreria-service/tesoreria/views.py::
    _PermiteSecretoInternoOTesoreriaCrear - el secreto interno servicio-a-
    servicio (X-Internal-Secret, ver settings.MATERIALES_INTERNAL_SECRET)
    es una via ADICIONAL para que compras-tesoreria-service pueda registrar
    una recepcion de compra sin que el analista de Compras necesite el
    permiso materiales.editar; nunca reemplaza el permiso normal para
    cualquier otro llamador."""

    message = "No tienes el permiso 'materiales.editar' para hacer esto."

    def has_permission(self, request, view):
        secreto_configurado = settings.MATERIALES_INTERNAL_SECRET
        secreto_recibido = request.META.get("HTTP_X_INTERNAL_SECRET")
        if secreto_configurado and secreto_recibido == secreto_configurado:
            return True
        return require_permission("materiales.editar")().has_permission(request, view)


class MaterialCatalogoViewSet(_PermisosMaterialesMixin, ModelViewSet):
    """Catalogo de materiales - sin ScopedManager (mismo criterio que el
    resto de este primer corte de materiales-service, ver models.py: sin
    columna de alcance declarada todavia)."""

    queryset = MaterialCatalogo.objects.all().order_by("material")
    serializer_class = MaterialCatalogoSerializer
    filter_backends = [SearchFilter]
    search_fields = ["material", "unidad_medida"]

    def get_permissions(self):
        if self.action in ("recibir_compra", "actualizar_precio_cotizado"):
            return [_PermiteSecretoInternoOMaterialesEditar()]
        return super().get_permissions()

    def _buscar_o_crear_material(self, material_nombre, unidad_medida=None):
        """Busca por nombre (case-insensitive) o crea el registro con
        cantidad_disponible=0 - compartido por recibir_compra (que ademas
        suma cantidad) y actualizar_precio_cotizado (que NO toca cantidad,
        solo precio/proveedor). "sistema" como actor: mismo criterio que el
        resto de las escrituras automaticas del servicio (ej.
        RequisicionViewSet)."""
        material = MaterialCatalogo.objects.select_for_update().filter(material__iexact=material_nombre).first()
        if material is None:
            material = MaterialCatalogo.objects.create(
                material=material_nombre,
                unidad_medida=unidad_medida or "pza",
                precio_unitario=0,
                cantidad_disponible=0,
                created_by="sistema",
                updated_by="sistema",
            )
        return material

    @action(detail=False, methods=["post"])
    def recibir_compra(self, request):
        """Suma al inventario cuando compras-tesoreria-service registra una
        recepcion (02/Sep/2026, "Recepciones va tener conexion con obra en
        la parte de materiales, para actualizar el inventario" - pedido de
        Mariana). Compras es la base: el analista de Compras no elige un
        MaterialCatalogo de antemano, esta llamada busca por nombre
        (case-insensitive) y crea el registro si no existia todavia -
        mismo criterio de "buscar o crear" que TesoreriaFlujoViewSet.
        confirmar_conciliacion usa para la contraparte detectada por IA.

        select_for_update evita perder un incremento si dos recepciones del
        mismo material llegan casi al mismo tiempo (mismo criterio anti-
        condicion-de-carrera que SolicitudMaterialViewSet.entregar).

        Body: {"material_nombre": str, "cantidad_recibida": number,
        "unidad_medida": str (solo si se crea nuevo),
        "precio_unitario": number (opcional, actualiza el ultimo precio),
        "proveedor": str (opcional, id_contraparte del proveedor)}."""
        material_nombre = (request.data.get("material_nombre") or "").strip()
        if not material_nombre:
            return Response({"material_nombre": ["Este campo es requerido."]}, status=400)
        try:
            cantidad_recibida = abs(Decimal(str(request.data.get("cantidad_recibida"))))
        except (TypeError, ValueError, InvalidOperation):
            return Response({"cantidad_recibida": ["Debe ser un número."]}, status=400)
        if cantidad_recibida <= 0:
            return Response({"cantidad_recibida": ["Debe ser mayor a cero."]}, status=400)

        # created_by/updated_by son CharField(8) (id de usuario corto, ver
        # models.py) - "sistema" es el mismo actor generico que ya usan las
        # demas escrituras automaticas del servicio (ej. RequisicionViewSet).
        actor = "sistema"
        with transaction.atomic():
            material = self._buscar_o_crear_material(material_nombre, request.data.get("unidad_medida"))
            material.cantidad_disponible = material.cantidad_disponible + cantidad_recibida
            update_fields = ["cantidad_disponible", "updated_by", "updated_at"]
            if request.data.get("precio_unitario"):
                material.precio_unitario = request.data["precio_unitario"]
                update_fields.append("precio_unitario")
            if request.data.get("proveedor"):
                material.proveedor = request.data["proveedor"]
                update_fields.append("proveedor")
            material.updated_by = actor
            material.save(update_fields=update_fields)

        return Response(MaterialCatalogoSerializer(material).data, status=200)

    @action(detail=False, methods=["post"])
    def actualizar_precio_cotizado(self, request):
        """Sincroniza precio_unitario/proveedor cuando Compras confirma una
        cotizacion (02/Sep/2026, pedido de Mariana - siguiente paso de la
        conexion Compras<->Obra, ver recibir_compra arriba). A diferencia
        de recibir_compra, esto NO es una entrega real todavia - solo
        registra que se cotizo a tal precio con tal proveedor, sin tocar
        cantidad_disponible (0 si el material es nuevo, sin existencia
        hasta que de verdad se reciba).

        Body: {"material_nombre": str, "precio_unitario": number,
        "unidad_medida": str (solo si se crea nuevo),
        "proveedor": str (opcional, id_contraparte del proveedor)}."""
        material_nombre = (request.data.get("material_nombre") or "").strip()
        if not material_nombre:
            return Response({"material_nombre": ["Este campo es requerido."]}, status=400)
        precio_unitario = request.data.get("precio_unitario")
        if not precio_unitario:
            return Response({"precio_unitario": ["Este campo es requerido."]}, status=400)

        with transaction.atomic():
            material = self._buscar_o_crear_material(material_nombre, request.data.get("unidad_medida"))
            material.precio_unitario = precio_unitario
            update_fields = ["precio_unitario", "updated_by", "updated_at"]
            if request.data.get("proveedor"):
                material.proveedor = request.data["proveedor"]
                update_fields.append("proveedor")
            material.updated_by = "sistema"
            material.save(update_fields=update_fields)

        return Response(MaterialCatalogoSerializer(material).data, status=200)


class ManoObraCatalogoViewSet(_PermisosMaterialesMixin, ModelViewSet):
    """Catalogo de mano de obra por etapa constructiva."""

    queryset = ManoObraCatalogo.objects.all().order_by("etapa_constructiva")
    serializer_class = ManoObraCatalogoSerializer
    filter_backends = [SearchFilter]
    search_fields = ["etapa_constructiva", "descripcion"]


class PresupuestoViewSet(_PermisosMaterialesMixin, ModelViewSet):
    """Cabecera de presupuesto por proyecto.

    31/Ago/2026 (auditoria de scope): antes `.all()` sin RLS pese a tener
    `proyecto` como columna propia - ahora usa ScopedManager real."""

    serializer_class = PresupuestoSerializer
    filter_backends = [SearchFilter]
    search_fields = ["proyecto", "denominacion"]

    def get_queryset(self):
        return Presupuesto.objects.for_scope(self.request.effective_scope).order_by("-created_at")


class ConceptoPresupuestoViewSet(_PermisosMaterialesMixin, ModelViewSet):
    """Detalle de un presupuesto (etapa constructiva -> concepto, con FK a
    Material/ManoObra). El motor que genera estas filas automaticamente a
    partir de la etapa constructiva no esta construido todavia (ver
    docstring del modelo) - alta manual por ahora."""

    serializer_class = ConceptoPresupuestoSerializer
    filter_backends = [SearchFilter]
    search_fields = ["etapa_constructiva", "concepto"]

    def get_queryset(self):
        queryset = (
            ConceptoPresupuesto.objects.for_scope(self.request.effective_scope)
            .select_related("presupuesto", "material", "mano_obra")
            .order_by("presupuesto", "etapa_constructiva")
        )
        presupuesto_id = self.request.query_params.get("presupuesto")
        if presupuesto_id:
            queryset = queryset.filter(presupuesto_id=presupuesto_id)
        return queryset


class PresupuestoFirmaViewSet(_PermisosMaterialesMixin, ModelViewSet):
    """Firmas de un presupuesto - registro interno simple, sin firma
    electronica real todavia (ver docstring del modelo)."""

    serializer_class = PresupuestoFirmaSerializer
    filter_backends = [SearchFilter]
    search_fields = ["firmante", "cargo"]

    def get_queryset(self):
        queryset = (
            PresupuestoFirma.objects.for_scope(self.request.effective_scope)
            .select_related("presupuesto")
            .order_by("-fecha")
        )
        presupuesto_id = self.request.query_params.get("presupuesto")
        if presupuesto_id:
            queryset = queryset.filter(presupuesto_id=presupuesto_id)
        return queryset


class SolicitudMaterialViewSet(_PermisosMaterialesMixin, ModelViewSet):
    """Solicitud de material contra almacen - es SOLO para pedir contra lo
    que ya hay en almacen (decision de Mariana 21/Ago/2026, no una
    requisicion de compra); `entregar` descuenta MaterialCatalogo.
    cantidad_disponible de verdad (con select_for_update contra condiciones
    de carrera entre solicitudes concurrentes del mismo material). Flujo de
    3 estados, sin paso intermedio de aprobacion: `entregar`/`rechazar`
    cambian el estado desde SOLICITADO."""

    serializer_class = SolicitudMaterialSerializer
    filter_backends = [SearchFilter]
    search_fields = ["proyecto", "material__material"]

    def get_queryset(self):
        return (
            SolicitudMaterial.objects.for_scope(self.request.effective_scope)
            .select_related("material")
            .prefetch_related("evidencias")
            .order_by("-fecha_solicitud")
        )

    def _cambiar_estado(self, request, nuevo_estado, extra_fields=None):
        solicitud = self.get_object()
        solicitud.estado = nuevo_estado
        update_fields = ["estado", "updated_at"]
        if extra_fields:
            for campo, valor in extra_fields.items():
                setattr(solicitud, campo, valor)
                update_fields.append(campo)
        solicitud.save(update_fields=update_fields)
        return Response(SolicitudMaterialSerializer(solicitud).data)

    @action(detail=True, methods=["post"])
    def entregar(self, request, pk=None):
        # No se puede cerrar como entregado sin evidencia fotografica de
        # recepcion (pedido de Mariana 21/Ago/2026: "no puede estar
        # entregado hasta que tenga foto") - al menos una entrada de la
        # bitacora (EvidenciaRecepcion) con link_drive capturado.
        solicitud = self.get_object()
        if not solicitud.evidencias.exclude(link_drive__isnull=True).exclude(link_drive="").exists():
            return Response(
                {"detail": "No se puede marcar como entregado sin al menos una foto en la bitácora de recepción."},
                status=400,
            )
        # Descuento real del almacen (pendiente hasta 21/Ago/2026) -
        # select_for_update bloquea la fila del material mientras se
        # revalida/descuenta, para que dos solicitudes del mismo material
        # entregandose "al mismo tiempo" no dejen cantidad_disponible en
        # negativo.
        with transaction.atomic():
            material = MaterialCatalogo.objects.select_for_update().get(pk=solicitud.material_id)
            if solicitud.cantidad_solicitada > material.cantidad_disponible:
                return Response(
                    {
                        "detail": (
                            f"Ya no hay suficiente '{material.material}' disponible en almacén "
                            f"({material.cantidad_disponible} {material.unidad_medida})."
                        )
                    },
                    status=400,
                )
            material.cantidad_disponible -= solicitud.cantidad_solicitada
            material.save(update_fields=["cantidad_disponible", "updated_at"])
            return self._cambiar_estado(
                request, SolicitudMaterial.ESTADO_ENTREGADO, {"fecha_entrega": timezone.now().date()}
            )

    @action(detail=True, methods=["post"])
    def rechazar(self, request, pk=None):
        return self._cambiar_estado(request, SolicitudMaterial.ESTADO_RECHAZADO)

    def get_permissions(self):
        if self.action in ("entregar", "rechazar"):
            return [require_permission("materiales.editar")()]
        return super().get_permissions()


class RequisicionViewSet(_PermisosMaterialesMixin, ModelViewSet):
    """Requisicion de materiales: documento por proyecto+etapa que jala los
    ConceptoPresupuesto ya presupuestados y ES la que dispara la compra -
    distinta de SolicitudMaterial/"Salida de almacen" (decision de Mariana
    21/Ago/2026, ver docstring del modelo). Flujo de 3 firmas simples (sin
    firma electronica todavia): `validar` -> `autorizar` (requiere validar
    primero) o `rechazar` en cualquier momento antes de autorizar.

    V1: no genera el .xlsx real todavia (pendiente, mismo formato que usa
    Ruben hoy) - solo expone la data via API para que el frontend renderice
    el documento."""

    serializer_class = RequisicionSerializer
    filter_backends = [SearchFilter]
    search_fields = ["folio", "proyecto", "etapa_constructiva"]

    def get_queryset(self):
        queryset = (
            Requisicion.objects.for_scope(self.request.effective_scope)
            .select_related("presupuesto")
            .prefetch_related("lineas")
            .order_by("-created_at")
        )
        proyecto = self.request.query_params.get("proyecto")
        if proyecto:
            queryset = queryset.filter(proyecto=proyecto)
        return queryset

    def perform_create(self, serializer):
        presupuesto = serializer.validated_data["presupuesto"]
        etapa = serializer.validated_data["etapa_constructiva"]
        num_viviendas = serializer.validated_data.get("num_viviendas") or 1
        actor = getattr(self.request.effective_scope, "identity_user_id", None) or "sistema"

        folio = f"{serializer.validated_data['proyecto']}-{timezone.now().strftime('%y%m%d')}-{uuid.uuid4().hex[:8].upper()}"
        requisicion = serializer.save(
            folio=folio,
            presupuesto_asignado=presupuesto.monto_total,
            solicito_por=actor,
            created_by=actor,
            updated_by=actor,
        )

        # Snapshot de los conceptos ya presupuestados para esa etapa -
        # `cantidad` de ConceptoPresupuesto se interpreta como cantidad POR
        # VIVIENDA (ver docstring de Requisicion).
        conceptos = ConceptoPresupuesto.objects.filter(presupuesto=presupuesto, etapa_constructiva=etapa)
        for concepto in conceptos:
            cantidad_total = concepto.cantidad * num_viviendas
            RequisicionLinea.objects.create(
                requisicion=requisicion,
                concepto=concepto,
                concepto_nombre=concepto.concepto,
                material=concepto.material,
                cantidad_por_vivienda=concepto.cantidad,
                cantidad_total=cantidad_total,
                precio_unitario=concepto.precio_unitario,
                importe=cantidad_total * concepto.precio_unitario,
                proveedor_cotizacion=concepto.material.proveedor if concepto.material_id else None,
                created_by=actor,
                updated_by=actor,
            )

    @action(detail=True, methods=["post"])
    def validar(self, request, pk=None):
        requisicion = self.get_object()
        if requisicion.estado != Requisicion.ESTADO_PENDIENTE:
            return Response({"detail": "Solo se puede validar una requisición pendiente."}, status=400)
        actor = getattr(request.effective_scope, "identity_user_id", None) or "sistema"
        requisicion.valido_por = actor
        requisicion.save(update_fields=["valido_por", "updated_at"])
        return Response(RequisicionSerializer(requisicion).data)

    @action(detail=True, methods=["post"])
    def autorizar(self, request, pk=None):
        requisicion = self.get_object()
        if requisicion.estado != Requisicion.ESTADO_PENDIENTE:
            return Response({"detail": "Solo se puede autorizar una requisición pendiente."}, status=400)
        if not requisicion.valido_por:
            return Response({"detail": "Falta validar la requisición antes de autorizar la compra."}, status=400)
        actor = getattr(request.effective_scope, "identity_user_id", None) or "sistema"
        requisicion.estado = Requisicion.ESTADO_AUTORIZADA
        requisicion.autorizo_compra_por = actor
        requisicion.save(update_fields=["estado", "autorizo_compra_por", "updated_at"])
        return Response(RequisicionSerializer(requisicion).data)

    @action(detail=True, methods=["post"])
    def rechazar(self, request, pk=None):
        requisicion = self.get_object()
        if requisicion.estado != Requisicion.ESTADO_PENDIENTE:
            return Response({"detail": "Solo se puede rechazar una requisición pendiente."}, status=400)
        requisicion.estado = Requisicion.ESTADO_RECHAZADA
        requisicion.save(update_fields=["estado", "updated_at"])
        return Response(RequisicionSerializer(requisicion).data)

    def get_permissions(self):
        if self.action in ("validar", "autorizar", "rechazar"):
            return [require_permission("materiales.editar")()]
        return super().get_permissions()


class EvidenciaRecepcionViewSet(_PermisosMaterialesMixin, ModelViewSet):
    """Bitacora de recepcion de material (foto + fecha/hora) contra una
    SolicitudMaterial - una solicitud puede tener varias entradas (entregas
    parciales). Alta requiere materiales.crear, igual que el resto."""

    serializer_class = EvidenciaRecepcionSerializer
    filter_backends = [SearchFilter]
    search_fields = ["solicitud__proyecto", "registrado_por"]

    def get_queryset(self):
        queryset = (
            EvidenciaRecepcion.objects.for_scope(self.request.effective_scope)
            .select_related("solicitud")
            .order_by("-fecha", "-hora")
        )
        solicitud_id = self.request.query_params.get("solicitud")
        if solicitud_id:
            queryset = queryset.filter(solicitud_id=solicitud_id)
        return queryset
