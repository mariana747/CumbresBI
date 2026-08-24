from django.utils import timezone
from cumbresbi_scope.permissions import require_permission
from rest_framework.decorators import action
from rest_framework.filters import SearchFilter
from rest_framework.response import Response
from rest_framework.viewsets import ModelViewSet

from .models import TesoreriaBanco, TesoreriaContraparte, TesoreriaContrato, TesoreriaCuenta, TesoreriaFlujo
from .serializers import (
    TesoreriaBancoSerializer,
    TesoreriaContraparteSerializer,
    TesoreriaContratoSerializer,
    TesoreriaCuentaSerializer,
    TesoreriaFlujoSerializer,
)


class _PermisosCatalogoTesoreriaMixin:
    """Mismo gate de permisos en los 3 catalogos de este primer corte de
    Fase 4 (Contraparte/Banco/Cuenta): crear=tesoreria.crear,
    editar/borrar=tesoreria.editar, lectura abierta (sin ScopedManager,
    catalogos compartidos entre sociedades - ver docstring de cada
    serializer). Un solo lugar para no repetir el mismo bloque 3 veces."""

    def get_permissions(self):
        if self.action == "create":
            return [require_permission("tesoreria.crear")()]
        if self.action in ("update", "partial_update", "destroy"):
            return [require_permission("tesoreria.editar")()]
        return super().get_permissions()


class TesoreriaContraparteViewSet(_PermisosCatalogoTesoreriaMixin, ModelViewSet):
    """Catalogo maestro de contrapartes (Fase 4, arranque formal 18/Ago/2026).
    CRUD real, sin ScopedManager (catalogo compartido entre sociedades, ver
    docstring del serializer) - filtro real por permiso
    (tesoreria.crear/.editar), mismo criterio que GeneralSociedadViewSet en
    iam-service (unico otro catalogo generico real del ERD).

    Busqueda de texto libre (?search=) sobre razon_social/rfc/contacto.
    Filtro adicional ?cliente=1 / ?proveedor=1 (19/Ago/2026) - para que el
    ContraparteSelector del frontend pueda mostrar solo uno u otro segun el
    contexto (ej. PLD preguntando si el expediente es de un cliente o un
    proveedor). Sin filtro, regresa todas por igual - un registro puede ser
    ambas cosas a la vez (cliente Y proveedor), no son excluyentes.
    DELETE es fisico (sin soft-delete en el ERD real) - usar con cuidado,
    igual advertencia que GeneralSociedadViewSet."""

    serializer_class = TesoreriaContraparteSerializer
    filter_backends = [SearchFilter]
    search_fields = ["razon_social", "rfc", "contacto"]

    def get_queryset(self):
        queryset = TesoreriaContraparte.objects.all().order_by("razon_social")
        if self.request.query_params.get("cliente") in ("1", "true", "True"):
            queryset = queryset.filter(cliente=True)
        if self.request.query_params.get("proveedor") in ("1", "true", "True"):
            queryset = queryset.filter(proveedor=True)
        return queryset


class TesoreriaBancoViewSet(_PermisosCatalogoTesoreriaMixin, ModelViewSet):
    """Catalogo de bancos (Banxico) - alimenta el selector de banco al
    crear una cuenta. Mismo criterio de permisos que Contraparte."""

    queryset = TesoreriaBanco.objects.all().order_by("banco")
    serializer_class = TesoreriaBancoSerializer
    filter_backends = [SearchFilter]
    search_fields = ["banco", "alias"]


class TesoreriaCuentaViewSet(_PermisosCatalogoTesoreriaMixin, ModelViewSet):
    """Cuentas bancarias. Mismo criterio de permisos que Contraparte/Banco."""

    queryset = TesoreriaCuenta.objects.select_related("banco").order_by("-created_at")
    serializer_class = TesoreriaCuentaSerializer
    filter_backends = [SearchFilter]
    search_fields = ["alias", "label", "rfc_razon_social", "clabe"]


class TesoreriaContratoViewSet(_PermisosCatalogoTesoreriaMixin, ModelViewSet):
    """Contratos (Fase 4, tercer corte) - primer recurso de tesoreria-service
    con alcance real por sociedad (ScopedManager, ver models.py). Mismo
    gate de permisos que los catalogos de arriba (tesoreria.crear/.editar) -
    la escritura no valida todavia que la sociedad enviada este dentro del
    alcance del actor (mismo criterio laxo que PldContraparteKycViewSet.create,
    que tampoco lo valida - queda documentado como limitacion conocida, no
    como descuido).

    Busqueda de texto libre (?search=) sobre id_contrato/sociedad."""

    serializer_class = TesoreriaContratoSerializer
    filter_backends = [SearchFilter]
    search_fields = ["id_contrato", "sociedad"]

    def get_queryset(self):
        return (
            TesoreriaContrato.objects.for_scope(self.request.effective_scope)
            .select_related("contraparte")
            .order_by("-created_at")
        )

    def perform_create(self, serializer):
        # id_contrato = "{sociedad}-{id_contraparte}-{consecutivo 3 digitos}"
        # (decision de Mariana 18/Ago/2026) - generado aqui, no autogenerado
        # por uuid como Contraparte/Cuenta, porque aqui si importa que sea
        # legible. Cuenta TODOS los contratos existentes de esa sociedad+
        # contraparte sin filtrar por scope (TesoreriaContrato.objects.filter
        # sin .for_scope() no aplica RLS) - el consecutivo debe ser correcto
        # sin importar que alcance tenga quien esta creando.
        #
        # Limitacion conocida: una condicion de carrera entre dos creaciones
        # simultaneas para la misma sociedad+contraparte podria generar el
        # mismo id_contrato (fallaria con IntegrityError, no en silencio) -
        # aceptable para el volumen esperado de esta pantalla (alta manual
        # por un analista, no un flujo de alta frecuencia).
        sociedad = serializer.validated_data["sociedad"]
        contraparte = serializer.validated_data["contraparte"]
        consecutivo = TesoreriaContrato.objects.filter(sociedad=sociedad, contraparte=contraparte).count() + 1
        serializer.save(id_contrato=f"{sociedad}-{contraparte.id_contraparte}-{consecutivo:03d}")


class TesoreriaFlujoViewSet(ModelViewSet):
    """Flujo de caja (Fase 4, Sem 21 del cronograma) - un movimiento real de
    dinero (pago a proveedor, reembolso, nomina) ligado a un contrato.
    Alcance real por sociedad via el contrato (ver models.py,
    SCOPE_FIELD_SOCIEDAD = "contrato__sociedad").

    Permisos: crear/editar = tesoreria.crear/.editar (igual que los demas
    recursos de este servicio); aprobar/rechazar un pago requiere el
    permiso distinto tesoreria.aprobar (segregacion de funciones - "quien
    captura no aprueba", mismo criterio que PLD_ANALISTA/PLD_APROBADOR).
    Segun permission_matrix.py, TESORERIA_ANALISTA tiene LCE (sin A) y
    FINANZAS_MANAGER tiene LCEA - el analista puede capturar y registrar el
    pago, pero no autorizarlo el mismo.

    Busqueda de texto libre (?search=) sobre id_flujo/concepto. Filtro
    adicional ?contrato=<id> desde la vista de detalle de un contrato."""

    serializer_class = TesoreriaFlujoSerializer
    filter_backends = [SearchFilter]
    search_fields = ["id_flujo", "concepto"]

    def get_permissions(self):
        if self.action == "create":
            return [require_permission("tesoreria.crear")()]
        if self.action in ("update", "partial_update", "destroy", "registrar_pago"):
            return [require_permission("tesoreria.editar")()]
        if self.action in ("aprobar", "rechazar"):
            return [require_permission("tesoreria.aprobar")()]
        return super().get_permissions()

    def get_queryset(self):
        queryset = (
            TesoreriaFlujo.objects.for_scope(self.request.effective_scope)
            .select_related("contrato", "cuenta")
            .order_by("-created_at")
        )
        contrato_id = self.request.query_params.get("contrato")
        if contrato_id:
            queryset = queryset.filter(contrato_id=contrato_id)
        return queryset

    def perform_create(self, serializer):
        # id_flujo = "FLJ-{consecutivo global de 6 digitos}" (ver ejemplo
        # real en piezas-de-tesoreria.html: "FLJ-000452") - consecutivo
        # global, no por contrato/sociedad como id_contrato, porque aqui el
        # ERD original (tesoreria_flujos.id_flujo) no trae de por si una
        # composicion legible con otro campo de negocio.
        consecutivo = TesoreriaFlujo.objects.count() + 1
        serializer.save(id_flujo=f"FLJ-{consecutivo:06d}")

    @action(detail=True, methods=["post"])
    def aprobar(self, request, pk=None):
        """Autoriza el pago (autorizacion/autorizado_por/fecha_autorizacion)
        - requerido antes de poder registrar_pago(). autorizado_por viene en
        el body porque, igual que PldContraparteKycViewSet.aprobar, todavia
        no hay resolucion real de JWT->actor en este punto del proyecto."""
        autorizado_por = request.data.get("autorizado_por")
        if not autorizado_por:
            return Response({"autorizado_por": ["Este campo es requerido."]}, status=400)

        flujo = self.get_object()
        flujo.autorizacion = True
        flujo.autorizado_por = autorizado_por
        flujo.fecha_autorizacion = timezone.now().date()
        flujo.validacion_estado = TesoreriaFlujo.VALIDACION_APROBADA
        flujo.save(
            update_fields=["autorizacion", "autorizado_por", "fecha_autorizacion", "validacion_estado"]
        )
        return Response(self.get_serializer(flujo).data)

    @action(detail=True, methods=["post"])
    def rechazar(self, request, pk=None):
        """Contraparte de aprobar() - un flujo rechazado no se puede pagar
        (ver registrar_pago). No borra el registro, deja evidencia de que
        se capturo y se rechazo, mismo criterio que PldContraparteKyc no
        borrar expedientes."""
        flujo = self.get_object()
        flujo.autorizacion = False
        flujo.validacion_estado = TesoreriaFlujo.VALIDACION_RECHAZADA
        flujo.save(update_fields=["autorizacion", "validacion_estado"])
        return Response(self.get_serializer(flujo).data)

    @action(detail=True, methods=["post"])
    def registrar_pago(self, request, pk=None):
        """Marca el flujo como pagado - exige autorizacion=True primero
        (no se puede pagar lo que no se aprobo, ver reunion de Tesoreria
        13/Ago/2026: "generar permiso por pago"). Permiso tesoreria.editar
        (no .aprobar) porque el analista es quien de verdad hace/registra
        la transferencia, la decision de autorizar ya la tomo aprobar()."""
        flujo = self.get_object()
        if not flujo.autorizacion:
            return Response(
                {"autorizacion": "Este flujo todavía no está autorizado para pago."}, status=400
            )
        flujo.pagado = True
        flujo.fecha_pago = timezone.now().date()
        flujo.descripcion_pago = request.data.get("descripcion_pago", flujo.descripcion_pago)
        flujo.link_comprobante_banco = request.data.get(
            "link_comprobante_banco", flujo.link_comprobante_banco
        )
        flujo.save(
            update_fields=["pagado", "fecha_pago", "descripcion_pago", "link_comprobante_banco"]
        )
        return Response(self.get_serializer(flujo).data)
