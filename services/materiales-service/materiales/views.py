import logging
import uuid
from decimal import Decimal, InvalidOperation

import requests
from cumbresbi_scope import forward_auth_headers
from cumbresbi_scope.permissions import require_permission
from django.conf import settings
from django.db import transaction
from django.db.models import Sum
from django.utils import timezone
from rest_framework.decorators import action
from rest_framework.exceptions import ValidationError
from rest_framework.filters import SearchFilter
from rest_framework.permissions import BasePermission
from rest_framework.response import Response
from rest_framework.views import APIView
from rest_framework.viewsets import ModelViewSet, ReadOnlyModelViewSet

from . import google_sheets_utils
from .pagination import ListadoGrandePagination
from .models import (
    ConceptoPresupuesto,
    EvidenciaRecepcion,
    ManoObraCatalogo,
    MaterialCatalogo,
    MaterialesNotificacion,
    Presupuesto,
    PresupuestoFirma,
    Requisicion,
    RequisicionLinea,
    RequisicionObra,
    SolicitudMaterial,
)
from .serializers import (
    ConceptoPresupuestoSerializer,
    EvidenciaRecepcionSerializer,
    ManoObraCatalogoSerializer,
    MaterialCatalogoSerializer,
    MaterialesNotificacionSerializer,
    PresupuestoFirmaSerializer,
    PresupuestoSerializer,
    RequisicionSerializer,
    SolicitudMaterialSerializer,
)

logger = logging.getLogger(__name__)


def _crear_solicitud_compra(requisicion, actor):
    """POST interno a compras-tesoreria-service al autorizar una
    Requisicion (21/Sep/2026, ver docstring de Requisicion). Fail-open:
    si compras-tesoreria-service no responde, la Requisicion igual queda
    AUTORIZADA - no se revierte nada, mismo criterio que
    _sincronizar_precio_cotizado en compras-tesoreria-service/views.py.
    Idempotente del lado de Compras (crear_desde_requisicion regresa la
    ya existente si vuelve a llamarse)."""
    if not settings.COMPRAS_INTERNAL_SECRET:
        return None
    try:
        upstream = requests.post(
            f"{settings.COMPRAS_TESORERIA_SERVICE_URL}/api/solicitudes/crear_desde_requisicion/",
            json={
                "requisicion": requisicion.id_requisicion,
                "proyecto": requisicion.proyecto,
                "descripcion": f"Requisición {requisicion.folio} — {requisicion.etapa_constructiva}",
                "solicitado_por": actor,
            },
            headers={"X-Internal-Secret": settings.COMPRAS_INTERNAL_SECRET},
            timeout=10,
        )
    except requests.RequestException:
        logger.warning("compras-tesoreria-service no respondio al autorizar %s", requisicion.id_requisicion, exc_info=True)
        return None
    if upstream.status_code not in (200, 201):
        logger.warning(
            "compras-tesoreria-service rechazo crear_desde_requisicion para %s: %s %s",
            requisicion.id_requisicion,
            upstream.status_code,
            upstream.text[:300],
        )
        return None
    return upstream.json().get("id_solicitud")


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

    serializer_class = MaterialCatalogoSerializer
    filter_backends = [SearchFilter]
    search_fields = ["material", "unidad_medida"]
    pagination_class = ListadoGrandePagination

    def get_queryset(self):
        # `solo_disponibles` (22/Sep/2026, "Catálogo de Materiales
        # Disponibles" en el frontend) - antes era un .filter() en el
        # cliente sobre el arreglo completo; con paginacion real esa pagina
        # ya no trae TODO el catalogo, asi que el filtro tiene que ser del
        # lado del servidor.
        queryset = MaterialCatalogo.objects.all().order_by("material")
        if self.request.query_params.get("solo_disponibles") == "true":
            queryset = queryset.filter(cantidad_disponible__gt=0)
        return queryset

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
        recepcion. Compras es la base: el analista de Compras no elige un
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
        cotizacion (siguiente paso de la conexion Compras<->Obra, ver
        recibir_compra arriba). A diferencia
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
        queryset = Presupuesto.objects.for_scope(self.request.effective_scope).order_by("-created_at")
        # Filtro real por Obra (18/Sep/2026, Nueva Requisicion necesita el
        # Presupuesto de cada Obra elegida) - "obra" NO esta en
        # search_fields, un ?search=<id_obra> no lo encontraria.
        obra = self.request.query_params.get("obra")
        if obra:
            queryset = queryset.filter(obra=obra)
        return queryset

    def perform_create(self, serializer):
        # created_by/updated_by son requeridos por el serializer pero el
        # frontend nunca los mandaba (bug pre-existente, ver
        # obra-requisicion-materiales-diseno en memoria del proyecto) - lo
        # corrijo de paso aqui porque el alta en bloque nueva de Presupuesto
        # (generar Obra -> Presupuesto automatico) depende de que este POST
        # funcione solo, mismo criterio que RequisicionViewSet.perform_create.
        actor = getattr(self.request.effective_scope, "identity_user_id", None) or "sistema"
        serializer.save(created_by=actor, updated_by=actor)

    @action(detail=True, methods=["post"])
    def generar_desde_catalogo(self, request, pk=None):
        """Snapshot inicial en $0 (18/Sep/2026, alta en bloque de Lotes en
        obra-service -> "que automaticamente se asignen las fases", ver
        obra-requisicion-flujo-completo-rediseno en memoria del proyecto):
        crea un ConceptoPresupuesto por cada ObraConcepto del catalogo
        estandar de Etapas/Conceptos (obra-service), con cantidad=0,
        listo para llenar despues. Solo agrega lo que falte - si ya existe
        un concepto con el mismo id_concepto de obra-service (guardado en
        `comentarios` como referencia) no lo duplica, para poder llamarse
        mas de una vez sin generar filas repetidas.

        GET simple sin secreto contra obra-service (mismo criterio que
        pld-service -> tesoreria-service: las lecturas cruzadas no exigen
        X-Internal-Secret)."""
        presupuesto = self.get_object()
        try:
            resp_etapas = requests.get(f"{settings.OBRA_SERVICE_URL}/api/etapas/", timeout=10)
            resp_etapas.raise_for_status()
            resp_conceptos = requests.get(f"{settings.OBRA_SERVICE_URL}/api/conceptos/", timeout=10)
            resp_conceptos.raise_for_status()
        except requests.RequestException:
            return Response({"detail": "No se pudo leer el catálogo de Etapas/Conceptos de Obra."}, status=502)

        etapas_por_id = {e["id_etapa"]: e["nombre"] for e in resp_etapas.json()}
        ya_generados = set(
            ConceptoPresupuesto.objects.filter(presupuesto=presupuesto, comentarios__startswith="obra_concepto:")
            .values_list("comentarios", flat=True)
        )
        actor = getattr(request.effective_scope, "identity_user_id", None) or "sistema"
        creados = []
        for concepto in resp_conceptos.json():
            referencia = f"obra_concepto:{concepto['id_concepto']}"
            if referencia in ya_generados:
                continue
            # `concepto` es CharField(250) - ObraConcepto.descripcion es un
            # TextField libre sin tope, puede exceder eso (visto en la
            # semilla real: "Data too long for column 'concepto'").
            texto_concepto = f"{concepto['numero']} {concepto['descripcion']}"[:250]
            creados.append(
                ConceptoPresupuesto.objects.create(
                    presupuesto=presupuesto,
                    etapa_constructiva=etapas_por_id.get(concepto["etapa"], ""),
                    concepto=texto_concepto,
                    cantidad=0,
                    precio_unitario=0,
                    importe=0,
                    comentarios=referencia,
                    created_by=actor,
                    updated_by=actor,
                )
            )
        return Response(ConceptoPresupuestoSerializer(creados, many=True).data, status=201)


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
    que ya hay en almacen, no una
    requisicion de compra; `entregar` descuenta MaterialCatalogo.
    cantidad_disponible de verdad (con select_for_update contra condiciones
    de carrera entre solicitudes concurrentes del mismo material). Flujo de
    3 estados, sin paso intermedio de aprobacion: `entregar`/`rechazar`
    cambian el estado desde SOLICITADO."""

    serializer_class = SolicitudMaterialSerializer
    filter_backends = [SearchFilter]
    search_fields = ["proyecto", "material__material"]
    pagination_class = ListadoGrandePagination

    def get_queryset(self):
        queryset = (
            SolicitudMaterial.objects.for_scope(self.request.effective_scope)
            .select_related("material")
            .prefetch_related("evidencias")
            .order_by("-fecha_solicitud")
        )
        estado = self.request.query_params.get("estado")
        if estado:
            queryset = queryset.filter(estado=estado)
        proyecto = self.request.query_params.get("proyecto")
        if proyecto:
            queryset = queryset.filter(proyecto=proyecto)
        return queryset

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
        # recepcion - al menos una entrada de la
        # bitacora (EvidenciaRecepcion) con link_drive capturado.
        solicitud = self.get_object()
        if not solicitud.evidencias.exclude(link_drive__isnull=True).exclude(link_drive="").exists():
            return Response(
                {"detail": "No se puede marcar como entregado sin al menos una foto en la bitácora de recepción."},
                status=400,
            )
        # Descuento real del almacen -
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
    distinta de SolicitudMaterial/"Salida de almacen" (ver docstring del
    modelo). Flujo de 3 firmas simples (sin
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
            .prefetch_related("lineas", "obras")
            .order_by("-created_at")
        )
        proyecto = self.request.query_params.get("proyecto")
        if proyecto:
            queryset = queryset.filter(proyecto=proyecto)
        return queryset

    def perform_create(self, serializer):
        proyecto = serializer.validated_data["proyecto"]
        etapa = serializer.validated_data["etapa_constructiva"]
        obras_ids = serializer.validated_data.pop("obras")
        if not obras_ids:
            raise ValidationError({"obras": ["Se requiere al menos una Obra."]})

        # Nunca mezclar Obras de proyectos distintos (regla explicita del
        # diseño, ver obra-requisicion-flujo-completo-rediseno) - se valida
        # contra obra-service (GET simple, mismo patron sin secreto que el
        # resto de lecturas cruzadas de este servicio).
        # ObraLote SI tiene RLS por proyecto (a diferencia de Etapas/
        # Conceptos, catalogo abierto) - una llamada anonima siempre
        # regresaria 0 filas. Reenvia el JWT/cookie del usuario original
        # (forward_auth_headers, misma utilidad ya usada en pld-service)
        # para que obra-service resuelva el scope de ese mismo usuario.
        headers, cookies = forward_auth_headers(self.request)
        try:
            resp = requests.get(
                f"{settings.OBRA_SERVICE_URL}/api/lotes/",
                params={"proyecto": proyecto},
                headers=headers,
                cookies=cookies,
                timeout=10,
            )
            resp.raise_for_status()
        except requests.RequestException:
            raise ValidationError({"obras": ["No se pudo validar las Obras contra obra-service."]})
        ids_del_proyecto = {lote["id_lote"] for lote in resp.json()}
        invalidas = set(obras_ids) - ids_del_proyecto
        if invalidas:
            raise ValidationError({"obras": [f"Estas Obras no pertenecen al proyecto {proyecto}: {sorted(invalidas)}"]})

        actor = getattr(self.request.effective_scope, "identity_user_id", None) or "sistema"

        # Cada Obra tiene su propio Presupuesto (18/Sep/2026, rediseño -
        # ver docstring del modelo) - se agrega sumando ConceptoPresupuesto
        # de esa etapa entre TODAS las Obras incluidas, agrupado por
        # Material. Solo cuenta lo que ya tiene Material asignado (lo que
        # sigue en $0/sin material del snapshot de generar_desde_catalogo
        # todavia no esta listo para pedirse).
        presupuestos = Presupuesto.objects.filter(obra__in=obras_ids)
        conceptos = ConceptoPresupuesto.objects.filter(
            presupuesto__in=presupuestos, etapa_constructiva=etapa, material__isnull=False
        ).select_related("material")

        cantidades_por_material = {}
        for concepto in conceptos:
            cantidades_por_material[concepto.material_id] = (
                cantidades_por_material.get(concepto.material_id, Decimal("0")) + concepto.cantidad
            )
        presupuesto_asignado = presupuestos.aggregate(total=Sum("monto_total"))["total"] or 0

        folio = f"{proyecto}-{timezone.now().strftime('%y%m%d')}-{uuid.uuid4().hex[:8].upper()}"
        requisicion = serializer.save(
            folio=folio,
            presupuesto_asignado=presupuesto_asignado,
            solicito_por=actor,
            created_by=actor,
            updated_by=actor,
        )
        for obra_id in obras_ids:
            RequisicionObra.objects.create(requisicion=requisicion, obra=obra_id)

        for material_id, cantidad_total in cantidades_por_material.items():
            material = MaterialCatalogo.objects.get(id_material=material_id)
            RequisicionLinea.objects.create(
                requisicion=requisicion,
                material=material,
                material_nombre=material.material,
                cantidad_total=cantidad_total,
                precio_unitario=material.precio_unitario,
                importe=cantidad_total * material.precio_unitario,
                proveedor_cotizacion=material.proveedor,
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
        id_solicitud_compra = _crear_solicitud_compra(requisicion, actor)
        update_fields = ["estado", "autorizo_compra_por", "updated_at"]
        if id_solicitud_compra:
            requisicion.id_solicitud_compra = id_solicitud_compra
            update_fields.append("id_solicitud_compra")
        requisicion.save(update_fields=update_fields)
        return Response(RequisicionSerializer(requisicion).data)

    @action(detail=True, methods=["post"])
    def rechazar(self, request, pk=None):
        requisicion = self.get_object()
        if requisicion.estado != Requisicion.ESTADO_PENDIENTE:
            return Response({"detail": "Solo se puede rechazar una requisición pendiente."}, status=400)
        requisicion.estado = Requisicion.ESTADO_RECHAZADA
        requisicion.save(update_fields=["estado", "updated_at"])
        return Response(RequisicionSerializer(requisicion).data)

    @action(detail=True, methods=["post"])
    def exportar_sheets(self, request, pk=None):
        """Exporta la Requisicion a Google Sheets, al Drive personal del
        usuario (22/Sep/2026, "ya no se descargara un xlsx sino se
        mandara al drive", mismo patron que TesoreriaFlujoViewSet.
        exportar_sheets). Si el usuario no ha conectado su cuenta de
        Google, regresa 409 con la url de autorizacion para que el
        frontend redirija."""
        requisicion = self.get_object()
        try:
            access_token = google_sheets_utils.obtener_access_token(request)
        except google_sheets_utils.GoogleSheetsNoConectado:
            try:
                url = google_sheets_utils.url_autorizacion(request)
            except requests.RequestException:
                return Response({"detail": "No se pudo iniciar la conexión con Google."}, status=502)
            return Response({"conectado": False, "url_autorizacion": url}, status=409)
        except requests.RequestException:
            return Response({"detail": "No se pudo validar la conexión con Google."}, status=502)

        encabezados = ["Material", "Cantidad", "Precio unitario", "Importe", "Cotización"]
        filas = [
            [l.material_nombre, str(l.cantidad_total), str(l.precio_unitario), str(l.importe), l.proveedor_cotizacion or ""]
            for l in requisicion.lineas.all()
        ]
        titulo = f"Requisición {requisicion.folio}"
        carpeta_id = request.data.get("carpeta_id") or None
        try:
            url = google_sheets_utils.crear_hoja(access_token, titulo, encabezados, filas, carpeta_id)
        except requests.RequestException:
            return Response({"detail": "No se pudo crear la hoja de cálculo en Google Sheets."}, status=502)
        return Response({"conectado": True, "url": url})

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

    @action(detail=True, methods=["post"])
    def subir_evidencia(self, request, pk=None):
        """Evidencia fotografica real (22/Sep/2026, mismo patron que
        RecepcionViewSet.subir_evidencia en compras-tesoreria-service):
        sube a Drive via drive-service y guarda el link. Quien sube es el
        propio usuario autenticado (forward_auth_headers reenvia su
        sesion), no una llamada servicio-a-servicio."""
        evidencia = self.get_object()
        archivo = request.FILES.get("file")
        if not archivo:
            return Response({"detail": "Campo 'file' requerido"}, status=400)

        headers, cookies = forward_auth_headers(request)
        carpeta = f"Materiales/Evidencias/{evidencia.id_evidencia}"
        try:
            upstream = requests.post(
                f"{settings.DRIVE_SERVICE_URL}/api/upload/",
                params={"perm": "materiales.editar"},
                files={"file": (archivo.name, archivo.read(), archivo.content_type)},
                data={"carpeta": carpeta},
                headers=headers,
                cookies=cookies,
                timeout=30,
            )
        except requests.RequestException:
            logger.warning("drive-service no respondio al subir evidencia de %s", evidencia.id_evidencia, exc_info=True)
            return Response({"detail": "El servicio de Drive no respondió. Intenta de nuevo."}, status=502)

        if upstream.status_code != 201:
            return Response(
                upstream.json() if upstream.content else {"detail": "Error al subir a Drive"},
                status=upstream.status_code,
            )

        resultado = upstream.json()
        evidencia.link_drive = resultado["web_view_link"]
        evidencia.updated_by = getattr(request.effective_scope, "identity_user_id", None) or "sistema"
        evidencia.save(update_fields=["link_drive", "updated_by", "updated_at"])
        return Response(self.get_serializer(evidencia).data)


class MaterialesNotificacionViewSet(ReadOnlyModelViewSet):
    """Campana de materiales-service (22/Sep/2026, ver docstring del
    modelo). Solo lectura de las propias - no hay alta manual, las crea la
    tarea programada (ver TareaRecordatoriosView abajo)."""

    serializer_class = MaterialesNotificacionSerializer

    def get_queryset(self):
        destinatario = getattr(self.request.effective_scope, "identity_user_id", None)
        queryset = MaterialesNotificacion.objects.filter(destinatario=destinatario)
        if self.request.query_params.get("solo_no_leidas") == "true":
            queryset = queryset.filter(leida=False)
        return queryset

    @action(detail=True, methods=["post"])
    def marcar_leida(self, request, pk=None):
        notificacion = self.get_object()
        notificacion.leida = True
        notificacion.save(update_fields=["leida"])
        return Response(self.get_serializer(notificacion).data)


class _PermiteSecretoTareasProgramadas(BasePermission):
    """Gate del endpoint que llama Cloud Scheduler (22/Sep/2026) - mismo
    criterio que _PermiteSecretoInternoOMaterialesEditar, pero sin permiso
    normal alternativo: nadie mas que la tarea programada debe disparar
    esto, no hay un usuario real detras via JWT."""

    message = "Requiere el secreto de tareas programadas."

    def has_permission(self, request, view):
        secreto_configurado = settings.TAREAS_PROGRAMADAS_SECRET
        secreto_recibido = request.META.get("HTTP_X_INTERNAL_SECRET")
        return bool(secreto_configurado) and secreto_recibido == secreto_configurado


class TareaRecordatoriosView(APIView):
    """POST /api/tareas/recordatorios-pedido/ - disparado a diario por
    Cloud Scheduler (22/Sep/2026, "recordatorios de pedido de material",
    ver docstring de MaterialesNotificacion). HOY es un no-op real: no
    existe todavia ningun campo de cantidad/fecha de inicio/dias de
    anticipacion por material (esos datos los va a dar el arquitecto,
    extraidos por IA de su documento de estandares - sin construir
    todavia). Cuando ese dato exista, aqui va la consulta real que
    compare "fecha de inicio - anticipacion" contra hoy y cree
    MaterialesNotificacion + mande el correo (mismo patron de
    mail_utils.py que ya usa Tesoreria) - el modelo/API/campana ya estan
    listos, no hace falta tocar nada mas del lado de infraestructura."""

    permission_classes = [_PermiteSecretoTareasProgramadas]

    def post(self, request):
        return Response({"revisados": 0, "creados": 0, "detail": "Sin estándares de material capturados todavía."})
