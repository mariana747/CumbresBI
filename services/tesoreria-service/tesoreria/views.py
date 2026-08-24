from cumbresbi_scope.permissions import require_permission
from rest_framework.filters import SearchFilter
from rest_framework.viewsets import ModelViewSet

from .models import TesoreriaBanco, TesoreriaContraparte, TesoreriaContrato, TesoreriaCuenta
from .serializers import (
    TesoreriaBancoSerializer,
    TesoreriaContraparteSerializer,
    TesoreriaContratoSerializer,
    TesoreriaCuentaSerializer,
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
