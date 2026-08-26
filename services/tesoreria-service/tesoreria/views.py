import logging
from datetime import timedelta

import requests
from cumbresbi_scope import forward_auth_headers
from django.conf import settings
from django.utils import timezone
from cumbresbi_scope.permissions import require_permission
from rest_framework.decorators import action
from rest_framework.filters import SearchFilter
from rest_framework.parsers import MultiPartParser
from rest_framework.response import Response
from rest_framework.viewsets import ModelViewSet

from .audit_utils import emitir_evento_auditoria
from .mail_utils import enviar_factura, enviar_reporte_diario

logger = logging.getLogger(__name__)
from .reportes import calcular_reporte_diario
from .models import (
    _short_id,
    FacturaConcepto,
    FacturaDoctoRelacionado,
    FacturaNotaCredito,
    FacturaTraslado,
    TesoreriaBanco,
    TesoreriaComplementoPago,
    TesoreriaContraparte,
    TesoreriaContraparteRelacion,
    TesoreriaContrato,
    TesoreriaCorteEdc,
    TesoreriaCuenta,
    TesoreriaFactura,
    TesoreriaFlujo,
    TesoreriaNotaCredito,
    TesoreriaRecNomina,
    TesoreriaSaldo,
)
from .serializers import (
    FacturaConceptoSerializer,
    FacturaDoctoRelacionadoSerializer,
    FacturaNotaCreditoSerializer,
    FacturaTrasladoSerializer,
    TesoreriaBancoSerializer,
    TesoreriaComplementoPagoSerializer,
    TesoreriaContraparteRelacionSerializer,
    TesoreriaContraparteSerializer,
    TesoreriaContratoSerializer,
    TesoreriaCorteEdcSerializer,
    TesoreriaCuentaSerializer,
    TesoreriaFacturaSerializer,
    TesoreriaFlujoSerializer,
    TesoreriaNotaCreditoSerializer,
    TesoreriaRecNominaSerializer,
    TesoreriaSaldoSerializer,
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
        if self.action in (
            "update", "partial_update", "destroy", "registrar_pago", "vincular_factura", "subir_comprobante",
        ):
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
        emitir_evento_auditoria(
            "tesoreria_flujos.aprobar",
            "tesoreria_flujos",
            flujo.id_flujo,
            actor_user_id=autorizado_por,
            valores_nuevos={"total_mxp": str(flujo.total_mxp) if flujo.total_mxp is not None else None},
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
        emitir_evento_auditoria(
            "tesoreria_flujos.rechazar",
            "tesoreria_flujos",
            flujo.id_flujo,
            actor_user_id=request.data.get("actor_user_id"),
        )
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
        emitir_evento_auditoria(
            "tesoreria_flujos.registrar_pago",
            "tesoreria_flujos",
            flujo.id_flujo,
            actor_user_id=request.data.get("actor_user_id"),
            valores_nuevos={
                "fecha_pago": str(flujo.fecha_pago) if flujo.fecha_pago else None,
                "link_comprobante_banco": flujo.link_comprobante_banco,
            },
        )
        return Response(self.get_serializer(flujo).data)

    @action(detail=True, methods=["post"], parser_classes=[MultiPartParser])
    def subir_comprobante(self, request, pk=None):
        """Sube el comprobante/referencia de pago real a Drive (via
        drive-service), finanzas.md sec. "General Notes": "Allow the user
        to upload receipts/references from their computer. They are stored
        in the correct Google Drive folder and the URL is recorded in the
        database" (decision 26/Ago/2026). Mismo patron que
        PldContraparteDocViewSet.subir (services/pld-service/pld/views.py) -
        separado de registrar_pago() porque el comprobante puede subirse
        antes, junto o despues de marcar el flujo como pagado.

        Sin Unidad compartida propia de Tesoreria todavia (ver
        DRIVE_SERVICE_URL en config/settings.py) - drive-service cae al
        fallback de la Unidad compartida CumbresBI con la subcarpeta
        "Tesoreria/Flujos/<id_flujo>"."""
        flujo = self.get_object()
        archivo = request.FILES.get("file")
        if not archivo:
            return Response({"detail": "Campo 'file' requerido"}, status=400)

        headers, cookies = forward_auth_headers(request)
        carpeta = f"Tesoreria/Flujos/{flujo.id_flujo}"
        try:
            upstream = requests.post(
                f"{settings.DRIVE_SERVICE_URL}/api/upload/",
                params={"perm": "tesoreria.editar"},
                files={"file": (archivo.name, archivo.read(), archivo.content_type)},
                data={"carpeta": carpeta},
                headers=headers,
                cookies=cookies,
                timeout=30,
            )
        except requests.RequestException:
            logger.warning("drive-service no respondio al subir comprobante de %s", flujo.id_flujo, exc_info=True)
            return Response({"detail": "El servicio de Drive no respondió. Intenta de nuevo."}, status=502)

        if upstream.status_code != 201:
            return Response(
                upstream.json() if upstream.content else {"detail": "Error al subir a Drive"},
                status=upstream.status_code,
            )

        resultado = upstream.json()
        flujo.link_comprobante_banco = resultado["web_view_link"]
        flujo.drive_file_id_comprobante = resultado["file_id"]
        flujo.save(update_fields=["link_comprobante_banco", "drive_file_id_comprobante"])

        emitir_evento_auditoria(
            "tesoreria_flujos.subir_comprobante",
            "tesoreria_flujos",
            flujo.id_flujo,
            actor_user_id=request.data.get("actor_user_id"),
            valores_nuevos={"nombre_archivo": archivo.name},
        )
        return Response(self.get_serializer(flujo).data)

    @action(detail=True, methods=["post"])
    def vincular_factura(self, request, pk=None):
        """Liga el flujo a una factura/complemento ya emitidos (Fase 4,
        Sem 20 del cronograma) - `factura`/`complemento` son de solo
        lectura en el serializer (ver TesoreriaFlujoSerializer) porque no
        tiene sentido escribirlos a mano en un POST/PATCH normal: la
        factura debe existir de antemano en tesoreria-service, esta accion
        solo valida eso y hace el enlace. Recibe timbre_uuid (PK real de
        ambos modelos), no el id numerico interno."""
        flujo = self.get_object()
        timbre_uuid_factura = request.data.get("factura")
        timbre_uuid_complemento = request.data.get("complemento")
        update_fields = []

        if timbre_uuid_factura:
            try:
                flujo.factura = TesoreriaFactura.objects.get(timbre_uuid=timbre_uuid_factura)
            except TesoreriaFactura.DoesNotExist:
                return Response({"factura": "No existe una factura con ese UUID."}, status=400)
            update_fields.append("factura")

        if timbre_uuid_complemento:
            try:
                flujo.complemento = TesoreriaComplementoPago.objects.get(timbre_uuid=timbre_uuid_complemento)
            except TesoreriaComplementoPago.DoesNotExist:
                return Response({"complemento": "No existe un complemento de pago con ese UUID."}, status=400)
            update_fields.append("complemento")

        if not update_fields:
            return Response({"detail": "Manda factura y/o complemento (timbre_uuid)."}, status=400)

        flujo.save(update_fields=update_fields)
        return Response(self.get_serializer(flujo).data)


class FacturaConceptoViewSet(_PermisosCatalogoTesoreriaMixin, ModelViewSet):
    """Lineas de una factura CFDI (Fase 4, Sem 20) - sin FK real hacia
    TesoreriaFactura en el ERD (ver docstring del modelo), el filtro
    ?uuid=<timbre_uuid> es el enlace real desde la pantalla de detalle de
    una factura. Mismo gate de permisos que los demas recursos de este
    servicio (tesoreria.crear/.editar) - de hecho reusa
    facturacion-cfdi.crear/.editar seria mas preciso, pero se decide en
    TesoreriaFacturaViewSet/ComplementoPago/NotaCredito (las cabeceras),
    no aqui (linea de detalle sin cabecera FK real que gatear)."""

    serializer_class = FacturaConceptoSerializer
    filter_backends = [SearchFilter]
    search_fields = ["descripcion", "no_identificacion"]

    def get_queryset(self):
        queryset = FacturaConcepto.objects.all().order_by("id")
        uuid_factura = self.request.query_params.get("uuid")
        if uuid_factura:
            queryset = queryset.filter(uuid=uuid_factura)
        return queryset


class _PermisosFacturacionCfdiMixin:
    """Gate de permisos de las 3 cabeceras CFDI (Factura/ComplementoPago/
    NotaCredito) - usa el servicio `facturacion-cfdi` de permission_matrix.py
    (distinto de `tesoreria`), ya asignado a TESORERIA_ANALISTA (LC) y
    FINANZAS_MANAGER (LCE) desde antes de este corte."""

    def get_permissions(self):
        if self.action == "create":
            return [require_permission("facturacion-cfdi.crear")()]
        if self.action in ("update", "partial_update", "destroy"):
            return [require_permission("facturacion-cfdi.editar")()]
        return super().get_permissions()


def _vincular_contraparte_por_rfc(instance):
    """Auto-llena instance.contraparte buscando una TesoreriaContraparte
    cuyo rfc == instance.emisor_rfc (el emisor del CFDI es siempre el
    proveedor, Cumbres es el receptor - ver TesoreriaFactura.contraparte en
    models.py). Se llama despues de crear o de confirmar_extraccion (cuando
    emisor_rfc pudo haber cambiado). No truena si no hay match ni si hay
    mas de una contraparte con el mismo RFC (no deberia pasar, rfc es
    unique, pero no es razon para tumbar la operacion real)."""
    if not instance.emisor_rfc:
        return
    try:
        contraparte = TesoreriaContraparte.objects.get(rfc=instance.emisor_rfc)
    except (TesoreriaContraparte.DoesNotExist, TesoreriaContraparte.MultipleObjectsReturned):
        return
    if instance.contraparte_id != contraparte.id_contraparte:
        instance.contraparte = contraparte
        instance.save(update_fields=["contraparte"])


class TesoreriaFacturaViewSet(_PermisosFacturacionCfdiMixin, ModelViewSet):
    """Factura CFDI recibida de un proveedor (Fase 4, Sem 20 del
    cronograma) - primer corte de encabezado, alta manual via API/
    formulario. confirmar_extraccion() abajo es el enlace real con el
    Motor Documental (24/Ago/2026, heredado del mismo patron que
    PldContraparteKycViewSet.confirmar_extraccion en pld-service). Busqueda
    de texto libre (?search=) sobre folio/UUID/nombres de emisor-receptor."""

    serializer_class = TesoreriaFacturaSerializer
    filter_backends = [SearchFilter]
    search_fields = ["comprobante_folio", "timbre_uuid", "emisor_nombre", "receptor_nombre", "emisor_rfc"]

    def get_queryset(self):
        # Filtro ?contraparte=<id> desde la "vista por proveedor" en la
        # pantalla de Contrapartes (25/Ago/2026).
        queryset = TesoreriaFactura.objects.select_related("contraparte").order_by("-created_at")
        contraparte_id = self.request.query_params.get("contraparte")
        if contraparte_id:
            queryset = queryset.filter(contraparte_id=contraparte_id)
        return queryset

    def perform_create(self, serializer):
        instance = serializer.save()
        _vincular_contraparte_por_rfc(instance)

    # Whitelist de columnas que confirmar_extraccion puede escribir - mismo
    # criterio que PldContraparteKycViewSet.CAMPOS_CONFIRMABLES (ver
    # pld/views.py): la IA propone, un humano ya reviso/corrigio en pantalla
    # antes de este POST. timbre_uuid queda FUERA a proposito (es la
    # identidad del registro, ya se captura a mano al crear la factura y el
    # frontend la deja fija/no editable despues - no se debe poder pisar
    # por una extraccion que leyo mal un documento).
    CAMPOS_CONFIRMABLES = {
        "comprobante_version",
        "comprobante_serie",
        "comprobante_folio",
        "comprobante_fecha",
        "comprobante_no_certificado",
        "comprobante_sub_total",
        "comprobante_moneda",
        "comprobante_exportacion",
        "comprobante_tipo_cambio",
        "comprobante_forma_pago",
        "comprobante_metodo_pago",
        "comprobante_total",
        "comprobante_tipo_de_comprobante",
        "comprobante_lugar_expedicion",
        "tipo_relacion",
        "uuid_relacionado",
        "emisor_rfc",
        "emisor_nombre",
        "emisor_regimen_fiscal",
        "receptor_rfc",
        "receptor_nombre",
        "receptor_domicilio_fiscal_receptor",
        "receptor_regimen_fiscal_receptor",
        "receptor_uso_cfdi",
        "timbre_version",
        "timbre_fecha_timbrado",
        "timbre_rfc_prov_certif",
        "timbre_no_certificado_sat",
    }

    def get_permissions(self):
        if self.action in ("confirmar_extraccion", "marcar_estado", "enviar_masivo"):
            return [require_permission("facturacion-cfdi.editar")()]
        return super().get_permissions()

    @action(detail=False, methods=["post"])
    def enviar_masivo(self, request):
        """Envio masivo de facturas por correo (finanzas.md: "Multiple
        invoices can be selected to send massively (separately)") - un
        correo INDIVIDUAL por factura seleccionada, no un digest. Body:
        {"envios": [{"factura": <id>, "destinatario": "<email>"}, ...]} - el
        destinatario lo edita el usuario en pantalla, prellenado con
        contraparte.email por defecto (ver TesoreriaFacturaSerializer.
        contraparte_email), nunca se infiere aqui en el backend."""
        envios = request.data.get("envios")
        if not isinstance(envios, list) or not envios:
            return Response({"detail": "Se requiere 'envios' (lista no vacía)."}, status=400)

        resultados = []
        for envio in envios:
            factura_id = envio.get("factura")
            destinatario = (envio.get("destinatario") or "").strip()
            if not factura_id or not destinatario:
                resultados.append({"factura": factura_id, "enviado": False, "detail": "Falta factura o destinatario."})
                continue
            try:
                factura = self.get_queryset().get(pk=factura_id)
            except TesoreriaFactura.DoesNotExist:
                resultados.append({"factura": factura_id, "enviado": False, "detail": "Factura no encontrada."})
                continue
            enviado = enviar_factura(request, destinatario, factura)
            resultados.append({"factura": factura_id, "enviado": enviado})
            if enviado:
                emitir_evento_auditoria(
                    "tesoreria_facturas.enviar_masivo",
                    "tesoreria_factura",
                    factura.id,
                    actor_user_id=request.data.get("actor_user_id"),
                    valores_nuevos={"destinatario": destinatario},
                )
        return Response({"resultados": resultados})

    @action(detail=True, methods=["post"])
    def marcar_estado(self, request, pk=None):
        """Cambia el estado del proceso de revision de la factura
        (PENDIENTE/EN_PROCESO/ACEPTADA/RECHAZADA, ver
        TesoreriaFactura.ESTADO_CHOICES) - pedido explicito de Mariana
        (24/Ago/2026). Pasar a ACEPTADA exige que ya esten cargados los dos
        archivos esenciales (link_pdf = vista previa en PDF, link_xml =
        comprobante fiscal digital) - sin eso no queda forma de comprobar
        despues que el CFDI aceptado es el correcto. Mismo permiso que
        editar la factura (facturacion-cfdi.editar) - a diferencia de
        TesoreriaFlujo, aqui no se segrega captura de aprobacion."""
        nuevo_estado = request.data.get("estado")
        if nuevo_estado not in dict(TesoreriaFactura.ESTADO_CHOICES):
            return Response({"estado": "Estado inválido."}, status=400)

        factura = self.get_object()
        if nuevo_estado == TesoreriaFactura.ESTADO_ACEPTADA and not (factura.link_pdf and factura.link_xml):
            return Response(
                {"detail": "Para aceptar la factura hace falta cargar el PDF y el XML."}, status=400
            )

        factura.estado = nuevo_estado
        factura.save(update_fields=["estado"])
        return Response(self.get_serializer(factura).data)

    @action(detail=True, methods=["post"])
    def confirmar_extraccion(self, request, pk=None):
        """Guarda en la factura los datos que salieron del Motor Documental
        (docint AnalyzeView, prompt "tesoreria.cfdi_factura") DESPUES de que
        el analista los reviso en pantalla - la IA propone, un humano
        confirma antes de que el dato quede como verdad de negocio (mismo
        criterio que pld-service, ver docstring de la clase).

        Body: {"campos": {<nombre_de_campo>: <valor>, ...}} - solo se
        aceptan campos en CAMPOS_CONFIRMABLES, cualquier otra llave
        (incluido timbre_uuid) se ignora silenciosamente."""
        campos = request.data.get("campos")
        if not isinstance(campos, dict) or not campos:
            return Response({"detail": "Se requiere 'campos' (objeto no vacío)."}, status=400)

        datos_validos = {k: v for k, v in campos.items() if k in self.CAMPOS_CONFIRMABLES}
        if not datos_validos:
            return Response(
                {"detail": "Ninguno de los campos enviados es confirmable en esta factura."},
                status=400,
            )

        factura = self.get_object()
        serializer = self.get_serializer(factura, data=datos_validos, partial=True)
        serializer.is_valid(raise_exception=True)
        serializer.save()
        _vincular_contraparte_por_rfc(factura)
        emitir_evento_auditoria(
            "tesoreria_facturas.confirmar_extraccion",
            "tesoreria_facturas",
            factura.timbre_uuid,
            actor_user_id=request.data.get("actor_user_id"),
            valores_nuevos={"campos": datos_validos},
        )
        return Response(serializer.data)


class TesoreriaComplementoPagoViewSet(_PermisosFacturacionCfdiMixin, ModelViewSet):
    """Complemento de pago (REP) - confirma fiscalmente que una factura a
    credito ya se pago. Mismo criterio de alta manual que Factura."""

    serializer_class = TesoreriaComplementoPagoSerializer
    filter_backends = [SearchFilter]
    search_fields = ["folio", "timbre_uuid", "emisor_nombre", "receptor_nombre", "emisor_rfc"]

    def get_queryset(self):
        # Ver comentario equivalente en TesoreriaFacturaViewSet.
        queryset = TesoreriaComplementoPago.objects.select_related("contraparte").order_by("-created_at")
        contraparte_id = self.request.query_params.get("contraparte")
        if contraparte_id:
            queryset = queryset.filter(contraparte_id=contraparte_id)
        return queryset

    def perform_create(self, serializer):
        instance = serializer.save()
        _vincular_contraparte_por_rfc(instance)


class TesoreriaNotaCreditoViewSet(_PermisosFacturacionCfdiMixin, ModelViewSet):
    """Nota de credito - ajuste fiscal sobre una factura ya emitida
    (uuid_relacionado es FK real, ver docstring del serializer)."""

    serializer_class = TesoreriaNotaCreditoSerializer
    filter_backends = [SearchFilter]
    search_fields = ["comprobante_folio", "timbre_uuid", "emisor_nombre", "receptor_nombre", "emisor_rfc"]

    def get_queryset(self):
        # Ver comentario equivalente en TesoreriaFacturaViewSet.
        queryset = (
            TesoreriaNotaCredito.objects.select_related("uuid_relacionado", "contraparte").order_by("-created_at")
        )
        contraparte_id = self.request.query_params.get("contraparte")
        if contraparte_id:
            queryset = queryset.filter(contraparte_id=contraparte_id)
        return queryset

    def perform_create(self, serializer):
        instance = serializer.save()
        _vincular_contraparte_por_rfc(instance)


class TesoreriaContraparteRelacionViewSet(_PermisosCatalogoTesoreriaMixin, ModelViewSet):
    """Representante legal / beneficiario controlador de una contraparte -
    dato que pide PLD/AML (bloque 1 del catalogo maestro, mismo gate de
    permisos que Contraparte/Banco/Cuenta). Filtro ?contraparte=<id> desde
    la vista de detalle de una contraparte."""

    serializer_class = TesoreriaContraparteRelacionSerializer
    filter_backends = [SearchFilter]

    def get_queryset(self):
        queryset = (
            TesoreriaContraparteRelacion.objects.select_related("contraparte", "contraparte_relacion")
            .order_by("-created_at")
        )
        contraparte_id = self.request.query_params.get("contraparte")
        if contraparte_id:
            queryset = queryset.filter(contraparte_id=contraparte_id)
        return queryset


class TesoreriaCorteEdcViewSet(_PermisosCatalogoTesoreriaMixin, ModelViewSet):
    """Corte / estado de cuenta bancario - PDF subido para conciliar contra
    los flujos capturados (bloque 5, reportes). Filtro ?cuenta=<id> desde
    la vista de detalle de una cuenta."""

    serializer_class = TesoreriaCorteEdcSerializer
    filter_backends = [SearchFilter]

    def get_queryset(self):
        queryset = TesoreriaCorteEdc.objects.select_related("cuenta").order_by("-fecha_final")
        cuenta_id = self.request.query_params.get("cuenta")
        if cuenta_id:
            queryset = queryset.filter(cuenta_id=cuenta_id)
        return queryset


class TesoreriaSaldoViewSet(_PermisosCatalogoTesoreriaMixin, ModelViewSet):
    """Foto del saldo de una cuenta en una fecha (bloque 5, reportes) - se
    llena por proceso/carga de archivo, no dato por dato a mano (ver
    docstring del serializer); el CRUD existe para eso, no para captura
    manual del dia a dia. Filtro ?cuenta=<alias/id> tal cual viene en el
    campo (CharField plano, sin FK real - ver models.py)."""

    serializer_class = TesoreriaSaldoSerializer
    filter_backends = [SearchFilter]
    search_fields = ["cuenta"]

    def get_permissions(self):
        # reporte_diario es lectura (mismo criterio abierto que list/
        # retrieve, ver _PermisosCatalogoTesoreriaMixin) - arrastrar y
        # enviar_reporte SI escriben/tienen efecto de lado (crean un
        # TesoreriaSaldo o mandan un correo real), gatean igual que crear.
        if self.action in ("arrastrar", "enviar_reporte"):
            return [require_permission("tesoreria.crear")()]
        return super().get_permissions()

    def get_queryset(self):
        queryset = TesoreriaSaldo.objects.all().order_by("-fecha")
        cuenta = self.request.query_params.get("cuenta")
        if cuenta:
            queryset = queryset.filter(cuenta=cuenta)
        return queryset

    @action(detail=False, methods=["get"])
    def reporte_diario(self, request):
        """Reporte diario de saldos (26/Ago/2026, ver documentos/finanzas.md)
        - por empresa (seleccion multiple via ?sociedades=rfc1,rfc2),
        trae todas las cuentas activas de esas sociedades, compara
        transacciones del dia (Flujo) contra el cambio de saldo. Calculo
        real en reportes.py (probado aparte, sin pasar por DRF)."""
        sociedades_param = request.query_params.get("sociedades", "")
        sociedades = [s for s in sociedades_param.split(",") if s]
        fecha = request.query_params.get("fecha") or timezone.localdate().isoformat()
        reporte = calcular_reporte_diario(sociedades, fecha)
        return Response(reporte)

    @action(detail=False, methods=["post"])
    def arrastrar(self, request):
        """"Arrastrar" el saldo del dia anterior (finanzas.md: "There must
        be an option to carry the same balance from the previous day") -
        copia el saldo mas reciente antes de `fecha` como saldo de `fecha`
        para esa cuenta, sin pedirle a nadie que lo vuelva a capturar a
        mano. Si ya existe un saldo para esa cuenta+fecha, no lo pisa (400
        explicito, en vez de sobreescribir en silencio un dato ya
        capturado)."""
        cuenta = request.data.get("cuenta")
        fecha = request.data.get("fecha")
        if not cuenta or not fecha:
            return Response({"detail": "Se requiere 'cuenta' y 'fecha'."}, status=400)

        if TesoreriaSaldo.objects.filter(cuenta=cuenta, fecha=fecha).exists():
            return Response({"detail": "Ya existe un saldo capturado para esa cuenta y fecha."}, status=400)

        anterior = TesoreriaSaldo.objects.filter(cuenta=cuenta, fecha__lt=fecha).order_by("-fecha").first()
        if not anterior:
            return Response({"detail": "No hay un saldo previo que arrastrar para esa cuenta."}, status=400)

        nuevo = TesoreriaSaldo.objects.create(
            id=_short_id(), fecha=fecha, cuenta=cuenta, saldo=anterior.saldo, cambio_dinero=0, cambio_porcentual=0
        )
        return Response(self.get_serializer(nuevo).data, status=201)

    @action(detail=False, methods=["post"])
    def enviar_reporte(self, request):
        """Envia el reporte diario ya calculado por correo (finanzas.md:
        "The report can be sent by email") - recalcula con los mismos
        filtros en vez de confiar en un reporte armado del lado del
        cliente, para que el correo siempre refleje datos frescos de la
        BD."""
        sociedades = request.data.get("sociedades") or []
        fecha = request.data.get("fecha") or timezone.localdate().isoformat()
        destinatarios = request.data.get("destinatarios") or []
        if not destinatarios:
            return Response({"detail": "Se requiere al menos un destinatario."}, status=400)

        reporte = calcular_reporte_diario(sociedades, fecha)
        enviado = enviar_reporte_diario(request, destinatarios, reporte)
        return Response({"enviado": enviado})


class FacturaTrasladoViewSet(_PermisosFacturacionCfdiMixin, ModelViewSet):
    """Linea de impuesto trasladado de una factura - filtro ?uuid=<timbre_uuid>
    desde la vista de detalle de la factura, mismo criterio que
    FacturaConceptoViewSet."""

    serializer_class = FacturaTrasladoSerializer
    filter_backends = [SearchFilter]

    def get_queryset(self):
        queryset = FacturaTraslado.objects.all().order_by("id")
        uuid_factura = self.request.query_params.get("uuid")
        if uuid_factura:
            queryset = queryset.filter(uuid=uuid_factura)
        return queryset


class FacturaDoctoRelacionadoViewSet(_PermisosFacturacionCfdiMixin, ModelViewSet):
    """Documento relacionado de una factura (parcialidades de pago) -
    filtro ?timbre_uuid=<uuid> desde la vista de detalle de la factura."""

    serializer_class = FacturaDoctoRelacionadoSerializer
    filter_backends = [SearchFilter]

    def get_queryset(self):
        queryset = FacturaDoctoRelacionado.objects.all().order_by("id")
        timbre_uuid = self.request.query_params.get("timbre_uuid")
        if timbre_uuid:
            queryset = queryset.filter(timbre_uuid=timbre_uuid)
        return queryset


class FacturaNotaCreditoViewSet(_PermisosFacturacionCfdiMixin, ModelViewSet):
    """Linea de una nota de credito (distinta de TesoreriaNotaCreditoViewSet,
    que es el encabezado) - filtro ?uuid=<timbre_uuid> de la nota de
    credito duena."""

    serializer_class = FacturaNotaCreditoSerializer
    filter_backends = [SearchFilter]

    def get_queryset(self):
        queryset = FacturaNotaCredito.objects.all().order_by("id")
        uuid_nota = self.request.query_params.get("uuid")
        if uuid_nota:
            queryset = queryset.filter(uuid=uuid_nota)
        return queryset


class TesoreriaRecNominaViewSet(_PermisosFacturacionCfdiMixin, ModelViewSet):
    """CFDI de nomina - encabezado/resumen (ver docstring del serializer).
    Bloqueado en la practica hasta que exista RRHH (sin catalogo real de
    empleados contra el que validar `nom_receptor_num_empleado`), pero el
    CRUD en si no depende de eso - mismo criterio que TesoreriaFlujo con
    id_empleado_reembolso."""

    queryset = TesoreriaRecNomina.objects.all().order_by("-created_at")
    serializer_class = TesoreriaRecNominaSerializer
    filter_backends = [SearchFilter]
    search_fields = ["folio", "timbre_uuid", "emisor_nombre", "receptor_nombre", "nom_receptor_num_empleado"]
