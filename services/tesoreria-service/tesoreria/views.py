import datetime
import logging

import requests
from cumbresbi_scope import forward_auth_headers
from django.conf import settings
from django.db.models import ProtectedError
from django.http import HttpResponse, StreamingHttpResponse
from django.utils import timezone
from django.views.decorators.clickjacking import xframe_options_exempt
from cumbresbi_scope.permissions import require_permission
from rest_framework.decorators import action
from rest_framework.exceptions import ValidationError
from rest_framework.filters import SearchFilter
from rest_framework.parsers import MultiPartParser
from rest_framework.permissions import BasePermission
from rest_framework.response import Response
from rest_framework.throttling import ScopedRateThrottle
from rest_framework.viewsets import ModelViewSet, ViewSet

from . import recaptcha
from .audit_utils import emitir_evento_auditoria
from .mail_utils import (
    enviar_correo_documento_faltante,
    enviar_correo_ticket_proveedor,
    enviar_factura,
    enviar_reporte_diario,
)
from .reportes import calcular_reporte_diario
from .ticket_utils import generate_token, hash_token
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
    TesoreriaContratoDocumento,
    TesoreriaCorteEdc,
    TesoreriaCuenta,
    TesoreriaDiaFestivo,
    TesoreriaDocumentoTicket,
    TesoreriaFactura,
    TesoreriaFlujo,
    TesoreriaNotaCredito,
    TesoreriaRecNomina,
    TesoreriaSaldo,
    TesoreriaSolicitudPago,
    TesoreriaTicketProveedor,
    TesoreriaTicketReembolso,
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
    TesoreriaContratoDocumentoSerializer,
    TesoreriaContratoSerializer,
    TesoreriaCorteEdcSerializer,
    TesoreriaCuentaSerializer,
    TesoreriaDiaFestivoSerializer,
    TesoreriaFacturaSerializer,
    TesoreriaFlujoSerializer,
    TesoreriaNotaCreditoSerializer,
    TesoreriaRecNominaSerializer,
    TesoreriaSaldoSerializer,
    TesoreriaSolicitudPagoSerializer,
    TesoreriaTicketProveedorSerializer,
    TesoreriaTicketReembolsoSerializer,
)
from .reembolso_utils import sincronizar_festivos_mx, ultimos_dos_dias_habiles_y_corte, validar_fecha_limite

logger = logging.getLogger(__name__)


class _EsEmpleadoAutenticado(BasePermission):
    """Cualquier usuario con sesion real (identity_user_id presente en su
    EffectiveScope, ver cumbresbi_scope/scope.py) - no requiere ningun
    perm_key de tesoreria.*. Es el gate de "MiCumbres" (self-service): un
    empleado sin ningun rol de Tesoreria/IAM asignado igual puede subir su
    propio ticket. Anonimo (JWT ausente/invalido) queda fuera."""

    message = "Se requiere una sesión activa para subir un ticket."

    def has_permission(self, request, view):
        scope = getattr(request, "effective_scope", None)
        return bool(scope and scope.identity_user_id)


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


class _PermiteSecretoInternoOTesoreriaCrear(BasePermission):
    """Crear una contraparte por el secreto interno servicio-a-servicio
    (pld-service, alta automatica del expediente KYC autonomo - ver
    pld/views.py::_crear_contraparte_minima_en_tesoreria) O por el permiso
    normal tesoreria.crear (pantalla de Contrapartes). Mismo patron que
    drive-service/drive/views.py::_autorizado - el secreto es una via
    adicional, nunca reemplaza el permiso en el caso normal con JWT de
    usuario (02/Sep/2026, cierre de la reconciliacion contraparte
    maestra)."""

    message = "No tienes el permiso 'tesoreria.crear' para hacer esto."

    def has_permission(self, request, view):
        secreto_configurado = settings.TESORERIA_INTERNAL_SECRET
        secreto_recibido = request.META.get("HTTP_X_INTERNAL_SECRET")
        if secreto_configurado and secreto_recibido == secreto_configurado:
            return True
        return require_permission("tesoreria.crear")().has_permission(request, view)


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

    def get_permissions(self):
        if self.action == "create":
            return [_PermiteSecretoInternoOTesoreriaCrear()]
        return super().get_permissions()

    def get_queryset(self):
        # OJO: NO filtrar fusionado_en aqui - retrieve()/update() usan
        # get_object(), que a su vez usa este queryset para encontrar el
        # objeto por pk (ver mas abajo). Si se excluyeran aqui los alias,
        # consultar/editar un id_contraparte viejo (ya fusionado) daria
        # 404 antes de llegar a resolver_sobreviviente() - justo lo
        # contrario de lo que se busca. El catalogo (list()) filtra los
        # alias por separado, ver mas abajo.
        queryset = TesoreriaContraparte.objects.all().order_by("razon_social")
        if self.request.query_params.get("cliente") in ("1", "true", "True"):
            queryset = queryset.filter(cliente=True)
        if self.request.query_params.get("proveedor") in ("1", "true", "True"):
            queryset = queryset.filter(proveedor=True)
        # ?sociedad= (02/Sep/2026, pedido explicito: "en todo donde aparezca
        # una sociedad agrega el filtro por sociedad") - la contraparte en
        # si no tiene columna de sociedad (catalogo compartido, ver
        # TesoreriaContraparteSerializer), se filtra via sus Contratos
        # (unico lugar donde SI vive una sociedad real). distinct() porque
        # una contraparte puede tener varios contratos con la misma
        # sociedad (join 1-a-muchos duplicaria filas sin esto).
        sociedad = self.request.query_params.get("sociedad")
        if sociedad:
            queryset = queryset.filter(contratos__sociedad=sociedad).distinct()
        return queryset

    def list(self, request, *args, **kwargs):
        """02/Sep/2026, fusion de contrapartes por RFC duplicado: un alias
        fusionado ya no es un registro vigente - no debe aparecer en el
        catalogo/pantalla de Contrapartes como si nada hubiera pasado (ver
        _fusionar_en). get_queryset() se queda sin filtrar (lo necesita
        get_object() para retrieve/update, ver comentario ahi); el filtro
        va solo aqui, en la vista de lista. Reimplementa
        ListModelMixin.list() en vez de solo llamar a super() porque ese
        metodo vuelve a invocar self.get_queryset() internamente, sin
        forma de inyectarle el filtro extra desde afuera."""
        queryset = self.filter_queryset(self.get_queryset()).filter(fusionado_en__isnull=True)
        page = self.paginate_queryset(queryset)
        if page is not None:
            serializer = self.get_serializer(page, many=True)
            return self.get_paginated_response(serializer.data)
        serializer = self.get_serializer(queryset, many=True)
        return Response(serializer.data)

    def retrieve(self, request, *args, **kwargs):
        """Si `pk` es un alias fusionado (ver fusionado_en/_fusionar_en),
        resuelve transparente al sobreviviente real - quien haya guardado
        el id viejo (PLD/Ventas) sigue recibiendo un 200 con datos reales,
        no un 404, y nota que el id_contraparte del body cambio."""
        instance = self.get_object().resolver_sobreviviente()
        serializer = self.get_serializer(instance)
        return Response(serializer.data)

    def create(self, request, *args, **kwargs):
        """Si el RFC ya existe en un registro vigente (no fusionado), no
        crea un duplicado - regresa el sobreviviente real con 200 (no 201,
        no se creo nada nuevo). Cierra el caso de alta manual/por IA que no
        sabe que esa contraparte ya existia con otro id_contraparte."""
        rfc = request.data.get("rfc")
        if rfc:
            existente = TesoreriaContraparte.objects.filter(rfc=rfc, fusionado_en__isnull=True).first()
            if existente:
                return Response(self.get_serializer(existente).data, status=200)
        return super().create(request, *args, **kwargs)

    def _fusionar_en(self, perdedor, sobreviviente):
        """Reasigna a `sobreviviente` todo lo que hoy cuelga de `perdedor`
        (Contratos/Facturas/Complementos/Notas de credito/Relaciones - todo
        FK real hacia TesoreriaContraparte) y marca a `perdedor` como alias
        fusionado. `perdedor` no se borra (varias de esas FK son PROTECT) -
        se queda como tumba/alias, ver fusionado_en en models.py."""
        TesoreriaContrato.objects.filter(contraparte=perdedor).update(contraparte=sobreviviente)
        TesoreriaFactura.objects.filter(contraparte=perdedor).update(contraparte=sobreviviente)
        TesoreriaComplementoPago.objects.filter(contraparte=perdedor).update(contraparte=sobreviviente)
        TesoreriaNotaCredito.objects.filter(contraparte=perdedor).update(contraparte=sobreviviente)
        TesoreriaContraparteRelacion.objects.filter(contraparte=perdedor).update(contraparte=sobreviviente)
        TesoreriaContraparteRelacion.objects.filter(contraparte_relacion=perdedor).update(
            contraparte_relacion=sobreviviente
        )
        perdedor.fusionado_en = sobreviviente
        perdedor.save(update_fields=["fusionado_en"])

    def update(self, request, *args, **kwargs):
        """Resuelve siempre al sobreviviente antes de guardar (mismo
        criterio que retrieve() - editar un alias viejo edita al registro
        vigente, no crea un fork). Si el body trae un `rfc` que ya
        pertenece a OTRO registro vigente, fusiona automaticamente en vez
        de tronar con el IntegrityError de rfc unique=True - ver
        _fusionar_en."""
        partial = kwargs.pop("partial", False)
        instance = self.get_object().resolver_sobreviviente()
        nuevo_rfc = request.data.get("rfc")
        if nuevo_rfc:
            duplicado = (
                TesoreriaContraparte.objects.filter(rfc=nuevo_rfc, fusionado_en__isnull=True)
                .exclude(pk=instance.pk)
                .first()
            )
            if duplicado:
                self._fusionar_en(instance, duplicado)
                instance = duplicado
        serializer = self.get_serializer(instance, data=request.data, partial=partial)
        serializer.is_valid(raise_exception=True)
        self.perform_update(serializer)
        return Response(serializer.data)

    def partial_update(self, request, *args, **kwargs):
        kwargs["partial"] = True
        return self.update(request, *args, **kwargs)

    def perform_create(self, serializer):
        # created_by/updated_by no se llenaban solos (encontrado en vivo
        # 28/Ago/2026: "no aparece que yo cree esa contraparte") - el
        # frontend nunca los mandaba y no habia perform_create que los
        # completara. identity_user_id es "quien esta autenticado" para
        # CUALQUIER usuario (no solo self-service, ver scope_utils.py en
        # iam-service) - es el mismo dato que ya usa
        # TesoreriaTicketReembolsoViewSet.perform_create para su created_by.
        # 02/Sep/2026: ahora tambien puede crearse via el secreto interno
        # servicio-a-servicio (sin JWT de usuario, ver
        # _PermiteSecretoInternoOTesoreriaCrear), donde effective_scope no
        # trae identity_user_id (o puede venir vacio) - se usa un actor fijo
        # legible en la bitacora en vez de tronar con AttributeError.
        scope = getattr(self.request, "effective_scope", None)
        actor = scope.identity_user_id if scope and scope.identity_user_id else "sistema-pld-service"
        serializer.save(created_by=actor, updated_by=actor)

    def perform_update(self, serializer):
        serializer.save(updated_by=self.request.effective_scope.identity_user_id)

    def destroy(self, request, *args, **kwargs):
        """Una contraparte referenciada por Contratos/Facturas/Complementos/
        Notas de credito (todos con on_delete=PROTECT hacia aca, ver
        models.py) no se puede borrar - antes esto tronaba como 500 crudo
        (ProtectedError sin capturar, encontrado en vivo 28/Ago/2026), ahora
        regresa un 400 explicando que esta en uso."""
        try:
            return super().destroy(request, *args, **kwargs)
        except ProtectedError as exc:
            nombres_modelos = sorted({obj.__class__.__name__ for obj in exc.protected_objects})
            return Response(
                {
                    "detail": (
                        "Esta contraparte no se puede borrar: está en uso en "
                        f"{', '.join(nombres_modelos)}."
                    )
                },
                status=400,
            )


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


class TesoreriaDiaFestivoViewSet(_PermisosCatalogoTesoreriaMixin, ModelViewSet):
    """Cache de dias festivos oficiales sincronizada de Nager.Date, usada
    por reembolso_utils para calcular los ultimos 2 dias habiles de cada
    mes (ver docstring del modelo). Se sincroniza sola de forma perezosa;
    esta accion sirve para forzar el refresco de un año sin esperar a que
    se dispare solo. Mismo criterio de permisos que Contraparte/Banco/
    Cuenta."""

    queryset = TesoreriaDiaFestivo.objects.all()
    serializer_class = TesoreriaDiaFestivoSerializer
    filter_backends = [SearchFilter]
    search_fields = ["descripcion"]

    def perform_create(self, serializer):
        serializer.save(created_by=self.request.effective_scope.identity_user_id)

    def get_permissions(self):
        if self.action == "sincronizar":
            return [require_permission("tesoreria.editar")()]
        return super().get_permissions()

    @action(detail=False, methods=["post"])
    def sincronizar(self, request):
        anio = request.data.get("anio") or timezone.now().year
        try:
            anio = int(anio)
        except (TypeError, ValueError):
            return Response({"anio": ["Debe ser un año numérico."]}, status=400)
        ok = sincronizar_festivos_mx(anio)
        if not ok:
            return Response(
                {"detail": "No se pudo contactar a Nager.Date, intenta de nuevo más tarde."}, status=502
            )
        return Response({"anio": anio, "sincronizado": True})


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

    def get_permissions(self):
        if self.action == "enviar_recordatorio_documentos":
            return [require_permission("tesoreria.editar")()]
        return super().get_permissions()

    def get_queryset(self):
        # Filtro ?contraparte=<id> (28/Ago/2026) - misma relacion 1:N que ya
        # existe en el modelo (una contraparte tiene varios contratos), usado
        # ahora desde la pantalla de Contrapartes para listar/crear los
        # contratos de una contraparte en particular. Mismo patron que
        # TesoreriaFacturaViewSet.get_queryset.
        queryset = (
            TesoreriaContrato.objects.for_scope(self.request.effective_scope)
            .select_related("contraparte")
            .order_by("-created_at")
        )
        contraparte_id = self.request.query_params.get("contraparte")
        if contraparte_id:
            queryset = queryset.filter(contraparte_id=contraparte_id)
        return queryset

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

    @action(detail=True, methods=["post"])
    def enviar_recordatorio_documentos(self, request, pk=None):
        """Avisa a la contraparte de los documentos que el analista
        SELECCIONO del checklist (28/Ago/2026, pedido explicito de Mariana:
        "se puede...seleccionar para picar en avisar a la contraparte de
        los documentos pendientes" - no se manda automatico por todos los
        pendientes, el analista elige cuales). UN correo por cada documento
        seleccionado, nunca un solo correo agrupando varios (ver
        enviar_correo_documento_faltante).

        Recibe `documento_ids` (lista de ids de TesoreriaContratoDocumento)
        en el body - 400 si viene vacia, si la contraparte no tiene email
        capturado, o si algun id seleccionado ya no esta pendiente
        (recibido=True) o no pertenece a este contrato."""
        contrato = self.get_object()
        email = contrato.contraparte.email
        if not email:
            return Response(
                {"detail": "La contraparte de este contrato no tiene email registrado."}, status=400
            )

        documento_ids = request.data.get("documento_ids") or []
        if not documento_ids:
            return Response(
                {"detail": "Selecciona al menos un documento pendiente para avisar."}, status=400
            )

        faltantes = list(contrato.documentos_requeridos.filter(recibido=False, id__in=documento_ids))
        if len(faltantes) != len(set(documento_ids)):
            return Response(
                {"detail": "Alguno de los documentos seleccionados ya no está pendiente o no existe."},
                status=400,
            )

        # Un TesoreriaDocumentoTicket nuevo por documento (28/Ago/2026,
        # pedido explicito de Mariana: "un correo por documento que falte" +
        # "esos [archivos] los subira el cliente...mediante una magic link
        # por doc faltante") - nunca se reusa el token de un documento para
        # otro, mismo criterio que TesoreriaTicketProveedor (token en claro
        # solo se expone en el correo, jamas se guarda).
        enviados = []
        for documento in faltantes:
            token, token_hash = generate_token()
            TesoreriaDocumentoTicket.objects.create(
                documento=documento,
                email=email,
                token_hash=token_hash,
                issued_by=request.data.get("actor_user_id"),
                expires_at=timezone.now() + datetime.timedelta(days=7),
                max_uses=1,
            )
            ok = enviar_correo_documento_faltante(
                request, email, contrato.id_contrato, documento.get_nombre_display(), token
            )
            if ok:
                enviados.append(documento.nombre)

        emitir_evento_auditoria(
            "tesoreria_contratos.enviar_recordatorio_documentos",
            "tesoreria_contratos",
            contrato.id_contrato,
            actor_user_id=request.data.get("actor_user_id"),
            valores_nuevos={"destinatario": email, "documentos": enviados},
        )
        return Response({"enviados": enviados, "total_pendientes": len(faltantes)})


class TesoreriaContratoDocumentoViewSet(ModelViewSet):
    """Checklist de documentos requeridos de un contrato.
    crear=tesoreria.crear, borrar=tesoreria.editar - el analista arma y
    depura el checklist. NO existe ninguna accion para que el analista
    suba/reemplace el archivo (28/Ago/2026, pedido explicito de Mariana:
    "no puede subir o reemplazar un archivo esos los subira el cliente...
    mediante una magic link", y despues confirmado sin excepcion manual:
    "no olvides quitar el boton de subir") - el UNICO camino para llenar
    `link_archivo`/`recibido` es que el cliente lo suba via
    TesoreriaDocumentoTicketViewSet.subir, sin sesion.

    No tiene ScopedManager propio (no hay columna de sociedad en este
    modelo), el alcance real llega filtrando por ?contrato=<id>, cuyo
    TesoreriaContrato si aplica RLS. Filtro obligatorio ?contrato=<id>
    (misma idea que TesoreriaFlujoViewSet con ?contrato=): sin el, no tiene
    sentido listar todo el checklist de todos los contratos junto.

    31/Ago/2026 (corregido tras auditoria de scope): el docstring de
    arriba describia el diseño correcto, pero get_queryset() nunca lo
    aplicaba de verdad - solo filtraba por el ?contrato=<id> tal cual
    vino en la URL, sin validar que ESE contrato estuviera dentro del
    alcance del usuario (hueco real: cualquiera con tesoreria.crear/
    editar/aprobar podia pedir el checklist de CUALQUIER contrato con
    solo saber su id, y sin ?contrato= regresaba TODO el checklist de
    TODOS los contratos). Ahora get_queryset valida el contrato contra
    TesoreriaContrato.objects.for_scope() antes de regresar nada."""

    serializer_class = TesoreriaContratoDocumentoSerializer

    def get_permissions(self):
        if self.action == "create":
            return [require_permission("tesoreria.crear")()]
        if self.action == "destroy":
            return [require_permission("tesoreria.editar")()]
        if self.action in ("update", "partial_update"):
            return [require_permission("tesoreria.aprobar")()]
        return super().get_permissions()

    def destroy(self, request, *args, **kwargs):
        """Un documento ya recibido (el cliente lo subió) deja de poder
        borrarse (28/Ago/2026, pedido explicito de Mariana: "si ya hay
        documentos subido por contraparte, el analista podra verlo y ya no
        podra borrar") - solo se puede depurar el checklist mientras sigue
        pendiente."""
        documento = self.get_object()
        if documento.recibido:
            return Response(
                {"detail": "Este documento ya fue recibido, no se puede borrar del checklist."}, status=400
            )
        return super().destroy(request, *args, **kwargs)

    def get_queryset(self):
        contrato_id = self.request.query_params.get("contrato")
        if not contrato_id:
            return TesoreriaContratoDocumento.objects.none()
        contrato_visible = TesoreriaContrato.objects.for_scope(self.request.effective_scope).filter(
            pk=contrato_id
        )
        if not contrato_visible.exists():
            return TesoreriaContratoDocumento.objects.none()
        return TesoreriaContratoDocumento.objects.select_related("contrato").filter(contrato_id=contrato_id)

class TesoreriaDocumentoTicketViewSet(ViewSet):
    """Ticket publico de UN documento del checklist (28/Ago/2026, pedido
    explicito de Mariana - ver TesoreriaDocumentoTicket). Solo expone
    "validar"/"subir", ambos publicos (sin sesion, sin ningun perm_key) -
    los tickets en si solo se generan desde
    TesoreriaContratoViewSet.enviar_recordatorio_documentos, no hay
    list/create/update/destroy manual expuesto para este recurso."""

    def get_permissions(self):
        return []

    def get_throttles(self):
        # Mismo criterio que TesoreriaTicketProveedorViewSet: rate limiting
        # solo en la accion cara (recaptcha + subida a Drive), publica sin
        # sesion.
        if self.action == "subir":
            self.throttle_scope = "tesoreria-ticket-subir"
            return [ScopedRateThrottle()]
        return super().get_throttles()

    @staticmethod
    def _resolver_ticket(token):
        """Mismo criterio que TesoreriaTicketProveedorViewSet._resolver_ticket
        - compartido entre validar() y subir() para no repetir las 3
        validaciones (revocado/expirado/agotado) en cada endpoint publico."""
        if not token:
            return None, Response({"token": ["Este campo es requerido."]}, status=400)

        try:
            ticket = TesoreriaDocumentoTicket.objects.select_related(
                "documento", "documento__contrato"
            ).get(token_hash=hash_token(token))
        except TesoreriaDocumentoTicket.DoesNotExist:
            return None, Response({"detail": "Token inválido."}, status=404)

        now = timezone.now()
        if ticket.revoked_at is not None:
            return None, Response({"detail": "Este link fue revocado."}, status=403)
        if ticket.expires_at < now:
            return None, Response({"detail": "Este link expiró."}, status=403)
        if ticket.uses_count >= ticket.max_uses:
            return None, Response({"detail": "Este link ya alcanzó su límite de usos."}, status=403)

        return ticket, None

    @action(detail=False, methods=["post"])
    def validar(self, request):
        """Valida el token en claro del link (NO marca uso todavia, eso lo
        hace subir() - para no gastar el uso solo por abrir la pagina).
        Regresa el nombre del documento y del contrato, para que la
        pagina publica salude al cliente con contexto."""
        ticket, error = self._resolver_ticket(request.data.get("token"))
        if error:
            return error
        return Response(
            {
                "nombre_documento": ticket.documento.get_nombre_display(),
                "id_contrato": ticket.documento.contrato_id,
            }
        )

    @action(detail=False, methods=["post"], parser_classes=[MultiPartParser])
    def subir(self, request):
        """Formulario publico del cliente: sube el documento que falta,
        sin sesion, canjeando el token del link. Protegido por reCAPTCHA,
        mismo patron que TesoreriaTicketProveedorViewSet.subir_factura."""
        ticket, error = self._resolver_ticket(request.data.get("token"))
        if error:
            return error

        archivo = request.FILES.get("file")
        if not archivo:
            return Response({"detail": "Campo 'file' requerido"}, status=400)

        if not recaptcha.verificar(request.data.get("recaptcha_token"), request.META.get("REMOTE_ADDR")):
            return Response({"detail": "Verificación reCAPTCHA fallida. Intenta de nuevo."}, status=400)

        documento = ticket.documento
        resultado, drive_error = _subir_a_drive(
            request, archivo, f"Tesoreria/Contratos/{documento.contrato_id}/Documentos"
        )
        if drive_error:
            return drive_error

        documento.link_archivo = resultado["web_view_link"]
        documento.drive_file_id = resultado["file_id"]
        documento.recibido = True
        documento.save(update_fields=["link_archivo", "drive_file_id", "recibido"])

        now = timezone.now()
        ticket.uses_count += 1
        ticket.last_used_at = now
        if ticket.first_used_at is None:
            ticket.first_used_at = now
        ticket.save(update_fields=["uses_count", "last_used_at", "first_used_at"])

        emitir_evento_auditoria(
            "tesoreria_documento_tickets.subir",
            "tesoreria_documento_tickets",
            ticket.id_ticket,
            actor_user_id="externo",
            valores_nuevos={"nombre_archivo": archivo.name, "contrato": documento.contrato_id},
        )
        return Response({"detail": "Documento subido correctamente. Tesorería lo va a procesar en breve."})


class TesoreriaFlujoViewSet(ModelViewSet):
    """Flujo de caja - un movimiento real de
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

    # Whitelist de columnas que confirmar_conciliacion puede escribir - mismo
    # criterio que TesoreriaFacturaViewSet.CAMPOS_CONFIRMABLES: la IA
    # (docint, prompt "tesoreria.comprobante_bancario") propone, el analista
    # ya reviso/corrigio en pantalla antes de este POST. Deliberadamente
    # acotado a los campos que de verdad puede leer un comprobante bancario -
    # nada de contrato/cuenta/autorizacion/pagado (eso lo deciden
    # aprobar()/registrar_pago(), no una extraccion).
    CAMPOS_CONFIRMABLES = {
        "fecha_efectiva",
        "concepto",
        "total_mxp",
        "link_referencia",
    }

    def get_permissions(self):
        if self.action == "create":
            return [require_permission("tesoreria.crear")()]
        if self.action in (
            "update",
            "partial_update",
            "destroy",
            "registrar_pago",
            "vincular_factura",
            "subir_comprobante",
            "confirmar_conciliacion",
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
        - requerido antes de poder registrar_pago(). autorizado_por se
        resuelve del JWT (identity_user_id, ver EffectiveScope) - antes venia
        del body y cualquiera podia poner el nombre que quisiera; el gate de
        permiso ya obliga a que sea alguien con tesoreria.aprobar, pero el
        campo no reflejaba quien de verdad hizo la accion."""
        autorizado_por = request.effective_scope.identity_user_id
        if not autorizado_por:
            return Response({"autorizado_por": ["No se pudo identificar al usuario autenticado."]}, status=400)

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
        """Marca el flujo como pagado - exige autorizacion=True primero. 
        Permiso tesoreria.editar
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
        database". Mismo patron que
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
        """Liga el flujo a una factura/complemento ya emitidos
         - `factura`/`complemento` son de solo
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
                return Response({"factura": ["No existe una factura con ese UUID."]}, status=400)
            update_fields.append("factura")

        if timbre_uuid_complemento:
            try:
                flujo.complemento = TesoreriaComplementoPago.objects.get(timbre_uuid=timbre_uuid_complemento)
            except TesoreriaComplementoPago.DoesNotExist:
                return Response({"complemento": ["No existe un complemento de pago con ese UUID."]}, status=400)
            update_fields.append("complemento")

        if not update_fields:
            return Response({"detail": "Manda factura y/o complemento (timbre_uuid)."}, status=400)

        flujo.save(update_fields=update_fields)
        return Response(self.get_serializer(flujo).data)

    @action(detail=True, methods=["post"])
    def confirmar_conciliacion(self, request, pk=None):
        """Guarda en el flujo los datos que salieron del Motor Documental
        (docint AnalyzeView, prompt "tesoreria.comprobante_bancario")
        DESPUES de que el analista los reviso en pantalla - mismo criterio
        de "la IA propone, un humano confirma" que
        TesoreriaFacturaViewSet.confirmar_extraccion (ver docstring de esa
        clase). Ver memoria "tesoreria-flujos-registro-y-conciliacion-ia-
        plan": este es el paso 4 (revisar/ajustar), la aprobacion final
        sigue siendo aprobar()/rechazar(), no esta accion.

        Body:
        - "campos": {<nombre_de_campo>: <valor>, ...} - solo se aceptan
          campos en CAMPOS_CONFIRMABLES, cualquier otra llave se ignora
          silenciosamente. Opcional si solo se manda contraparte/factura.
        - "contraparte_nombre": nombre que la IA leyo en el comprobante para
          la contraparte del movimiento (extracted_data.contraparte_nombre).
          Si ya existe una TesoreriaContraparte con ese razon_social
          (busqueda case-insensitive) se reutiliza; si no, se crea una
          nueva con origen=ia (email/tipo_persona quedan vacios - ver
          TesoreriaContraparteSerializer.validate). Se regresa en la
          respuesta como "contraparte_detectada", no se liga sola al flujo
          (el flujo no tiene FK directa a contraparte, solo via contrato).
        - "factura"/"complemento": mismo formato que vincular_factura
          (timbre_uuid), para que la IA proponga el match y esta misma
          llamada lo confirme de una vez."""
        flujo = self.get_object()
        campos = request.data.get("campos") or {}
        if campos and not isinstance(campos, dict):
            return Response({"detail": "'campos' debe ser un objeto."}, status=400)

        datos_validos = {k: v for k, v in campos.items() if k in self.CAMPOS_CONFIRMABLES}
        if datos_validos:
            serializer = self.get_serializer(flujo, data=datos_validos, partial=True)
            serializer.is_valid(raise_exception=True)
            serializer.save()

        contraparte_detectada = None
        contraparte_nombre = (request.data.get("contraparte_nombre") or "").strip()
        if contraparte_nombre:
            contraparte_detectada = TesoreriaContraparte.objects.filter(
                razon_social__iexact=contraparte_nombre
            ).first()
            if contraparte_detectada is None:
                contraparte_detectada = TesoreriaContraparte.objects.create(
                    razon_social=contraparte_nombre,
                    origen=TesoreriaContraparte.ORIGEN_IA,
                )

        timbre_uuid_factura = request.data.get("factura")
        timbre_uuid_complemento = request.data.get("complemento")
        if timbre_uuid_factura:
            try:
                flujo.factura = TesoreriaFactura.objects.get(timbre_uuid=timbre_uuid_factura)
                flujo.save(update_fields=["factura"])
            except TesoreriaFactura.DoesNotExist:
                return Response({"factura": ["No existe una factura con ese UUID."]}, status=400)
        if timbre_uuid_complemento:
            try:
                flujo.complemento = TesoreriaComplementoPago.objects.get(timbre_uuid=timbre_uuid_complemento)
                flujo.save(update_fields=["complemento"])
            except TesoreriaComplementoPago.DoesNotExist:
                return Response({"complemento": ["No existe un complemento de pago con ese UUID."]}, status=400)

        emitir_evento_auditoria(
            "tesoreria_flujos.confirmar_conciliacion",
            "tesoreria_flujos",
            flujo.id_flujo,
            actor_user_id=request.data.get("actor_user_id"),
            valores_nuevos={
                "campos": datos_validos,
                "contraparte_detectada": contraparte_detectada.id_contraparte if contraparte_detectada else None,
            },
        )

        flujo.refresh_from_db()
        data = self.get_serializer(flujo).data
        data["contraparte_detectada"] = (
            TesoreriaContraparteSerializer(contraparte_detectada).data if contraparte_detectada else None
        )
        return Response(data)


class TesoreriaTicketReembolsoViewSet(ModelViewSet):
    """Tickets de reembolso de MiCumbres (pantalla PROVISIONAL
    /mi-cumbres/tickets, 27/Ago/2026 - ver docstring del modelo en
    models.py). Regla de permisos pedida por Mariana: el empleado sube su
    propio ticket (crear + subir_ticket), Tesoreria es quien despues
    adjunta la factura real y liga el pago - el empleado NUNCA puede
    editar/borrar un ticket una vez creado.

    Lectura (31/Ago/2026, corregido tras auditoria de scope - antes era un
    filtro manual "tesoreria.editar ve TODO sin importar su alcance", hueco
    real para un colaborador externo con tesoreria.editar acotado a una
    sola sociedad): ahora usa el mismo ScopedManager que el resto
    del proyecto, via SCOPE_FIELD_IDENTITY/SOCIEDAD del modelo (SCOPE_FIELD_
    CENTRO se elimino 03/Sep/2026 junto con el campo `centro`, ver
    docstring del modelo). Un empleado (self-service, sin permiso, con
    identity_user_id) ve solo lo suyo; quien tiene tesoreria.editar Y es
    is_global ve todo; quien tiene tesoreria.editar pero esta acotado por
    sociedad ve solo esos - ya no ve todo por el simple hecho de tener el
    permiso."""

    serializer_class = TesoreriaTicketReembolsoSerializer
    filter_backends = [SearchFilter]
    search_fields = ["id_ticket", "descripcion"]

    def get_permissions(self):
        if self.action in ("create", "subir_ticket"):
            return [_EsEmpleadoAutenticado()]
        if self.action in (
            "update", "partial_update", "destroy", "aprobar", "rechazar",
            "subir_factura", "vincular_factura", "vincular_flujo",
        ):
            return [require_permission("tesoreria.editar")()]
        return super().get_permissions()

    @action(detail=False, methods=["get"])
    def fecha_limite(self, request):
        """Fecha de corte real del mes en curso (03/Sep/2026, pedido de
        Mariana: "que se coloque el dia/mes/año de hasta cuando se
        aceptan" en vez de solo describir la regla en texto). Lectura
        abierta a cualquier empleado autenticado - la necesitan ver ANTES
        de intentar crear un ticket, mismo criterio que create/subir_ticket."""
        hoy = timezone.now().date()
        bloqueados, corte = ultimos_dos_dias_habiles_y_corte(hoy.year, hoy.month)
        return Response(
            {
                "fecha_corte": corte.isoformat() if corte else None,
                "dias_bloqueados": [d.isoformat() for d in bloqueados],
                "en_cierre_hoy": hoy in bloqueados,
            }
        )

    def get_queryset(self):
        queryset = (
            TesoreriaTicketReembolso.objects.for_scope(self.request.effective_scope)
            .select_related("flujo")
            .order_by("-created_at")
        )
        # 31/Ago/2026 (pedido de Mariana: "igual en tickets debe tener
        # filtro") - acota la vista sin cambiar el scope real de la sesion,
        # mismo criterio que PldContraparteKycViewSet.get_queryset.
        sociedad = self.request.query_params.get("sociedad")
        if sociedad:
            queryset = queryset.filter(sociedad=sociedad)
        return queryset

    def perform_create(self, serializer):
        # Fecha limite mensual (minuta 03/Sep/2026): ver reembolso_utils.
        # Se valida aqui, antes de guardar - un ticket rechazado por esto
        # nunca llega a crearse (no queda un registro RECHAZADO, el
        # empleado simplemente no puede enviarlo).
        error = validar_fecha_limite(timezone.now().date(), serializer.validated_data.get("fecha_gasto"))
        if error:
            raise ValidationError({"fecha_gasto": [error]})

        # id_ticket = "TKT-{consecutivo global de 6 digitos}", mismo
        # criterio que TesoreriaFlujo.id_flujo (ver perform_create de
        # TesoreriaFlujoViewSet).
        consecutivo = TesoreriaTicketReembolso.objects.count() + 1
        serializer.save(
            id_ticket=f"TKT-{consecutivo:06d}",
            id_empleado=self.request.effective_scope.identity_user_id,
            created_by=self.request.effective_scope.identity_user_id,
        )

    @action(detail=True, methods=["post"], parser_classes=[MultiPartParser])
    def subir_ticket(self, request, pk=None):
        """Sube la foto/comprobante del ticket a Drive (mismo patron que
        TesoreriaFlujoViewSet.subir_comprobante) - solo el empleado dueño
        del ticket puede llamarla (get_object ya filtra por
        get_queryset, que a su vez ya lo restringe a sus propios tickets
        si no tiene tesoreria.editar)."""
        ticket = self.get_object()
        archivo = request.FILES.get("file")
        if not archivo:
            return Response({"detail": "Campo 'file' requerido"}, status=400)

        resultado, error = _subir_a_drive(request, archivo, f"Tesoreria/Facturas/TicketsReembolso/{ticket.id_ticket}")
        if error:
            return error

        ticket.link_ticket = resultado["web_view_link"]
        ticket.drive_file_id_ticket = resultado["file_id"]
        ticket.mime_type_ticket = resultado.get("mime_type")
        ticket.save(update_fields=["link_ticket", "drive_file_id_ticket", "mime_type_ticket"])
        emitir_evento_auditoria(
            "tesoreria_tickets_reembolso.subir_ticket",
            "tesoreria_tickets_reembolso",
            ticket.id_ticket,
            actor_user_id=ticket.id_empleado,
            valores_nuevos={"nombre_archivo": archivo.name},
        )
        return Response(self.get_serializer(ticket).data)

    @action(detail=True, methods=["post"])
    def aprobar(self, request, pk=None):
        """Primer paso de la revision (27/Ago/2026, flujo pedido por
        Mariana, orden final: "verificar con Gemini, muestra los datos, se
        aprueba, luego se sube factura"): Tesoreria verifica con el Motor
        Documental el comprobante/foto que subio el empleado
        (`tesoreria.ticket_gasto`, sobre link_ticket/drive_file_id_ticket,
        ver TicketsReembolsoAdminPanel.tsx) y, viendo los datos extraidos,
        decide si el gasto procede - todavia NO hay factura ni pago, solo
        la decision de que el ticket es valido. Solo se puede aprobar desde
        PENDIENTE. La obligacion de pasar por el Motor Documental antes de
        aprobar se enforce en el frontend (unico boton que llama a este
        endpoint es el "Confirmar" del dialogo, no hay boton manual de
        Aprobar) - no hay un campo propio en el modelo para verificar esto
        del lado del backend, igual que el resto de "confirmar extraccion"
        del Motor Documental en otros modulos (PLD, Facturas). Requiere
        tesoreria.editar.

        autorizado_por/fecha_autorizacion (03/Sep/2026, minuta: "se necesita
        autorizar antes de pagar") se resuelven del JWT igual que
        TesoreriaFlujoViewSet.aprobar - antes este aprobar() solo cambiaba
        el estado sin dejar rastro de quien lo hizo."""
        ticket = self.get_object()
        if ticket.estado != TesoreriaTicketReembolso.ESTADO_PENDIENTE:
            return Response({"estado": ["Solo se puede aprobar un ticket Pendiente."]}, status=400)
        ticket.estado = TesoreriaTicketReembolso.ESTADO_APROBADO
        ticket.autorizado_por = request.effective_scope.identity_user_id
        ticket.fecha_autorizacion = timezone.now().date()
        ticket.comentarios = request.data.get("comentarios", ticket.comentarios)
        ticket.save(update_fields=["estado", "autorizado_por", "fecha_autorizacion", "comentarios"])
        emitir_evento_auditoria(
            "tesoreria_tickets_reembolso.aprobar",
            "tesoreria_tickets_reembolso",
            ticket.id_ticket,
            actor_user_id=request.data.get("actor_user_id"),
        )
        return Response(self.get_serializer(ticket).data)

    @action(detail=True, methods=["post"])
    def rechazar(self, request, pk=None):
        """Contraparte de aprobar() - solo desde PENDIENTE (un ticket ya
        aprobado/vinculado no se rechaza aqui, se maneja aparte).
        Requiere tesoreria.editar."""
        ticket = self.get_object()
        if ticket.estado != TesoreriaTicketReembolso.ESTADO_PENDIENTE:
            return Response({"estado": ["Solo se puede rechazar un ticket Pendiente."]}, status=400)
        ticket.estado = TesoreriaTicketReembolso.ESTADO_RECHAZADO
        ticket.comentarios = request.data.get("comentarios", ticket.comentarios)
        ticket.save(update_fields=["estado", "comentarios"])
        emitir_evento_auditoria(
            "tesoreria_tickets_reembolso.rechazar",
            "tesoreria_tickets_reembolso",
            ticket.id_ticket,
            actor_user_id=request.data.get("actor_user_id"),
        )
        return Response(self.get_serializer(ticket).data)

    @action(detail=True, methods=["post"], parser_classes=[MultiPartParser])
    def subir_factura(self, request, pk=None):
        """Staging del PDF de la factura real, SOLO sobre un ticket ya
        APROBADO (27/Ago/2026, orden final: primero se verifica el ticket
        con el Motor Documental y se aprueba, despues se sube y factura) -
        el Motor Documental corre desde el frontend sobre este mismo
        archivo (mismo MotorDocumentalDialog que PLD/Materiales) para
        prellenar el alta formal de TesoreriaFactura (Facturas > Nueva
        factura); esta accion solo sube el PDF a Drive, no crea la factura
        por si sola. Requiere tesoreria.editar (ver get_permissions)."""
        ticket = self.get_object()
        if ticket.estado != TesoreriaTicketReembolso.ESTADO_APROBADO:
            return Response({"estado": ["El ticket debe estar Aprobado antes de facturar."]}, status=400)
        archivo = request.FILES.get("file")
        if not archivo:
            return Response({"detail": "Campo 'file' requerido"}, status=400)

        resultado, error = _subir_a_drive(request, archivo, f"Tesoreria/Facturas/TicketsReembolso/{ticket.id_ticket}")
        if error:
            return error

        ticket.link_factura_pdf = resultado["web_view_link"]
        ticket.drive_file_id_factura = resultado["file_id"]
        ticket.mime_type_factura = resultado.get("mime_type")
        ticket.save(update_fields=["link_factura_pdf", "drive_file_id_factura", "mime_type_factura"])
        emitir_evento_auditoria(
            "tesoreria_tickets_reembolso.subir_factura",
            "tesoreria_tickets_reembolso",
            ticket.id_ticket,
            actor_user_id=request.data.get("actor_user_id"),
            valores_nuevos={"nombre_archivo": archivo.name},
        )
        return Response(self.get_serializer(ticket).data)

    @action(detail=True, methods=["get"])
    @xframe_options_exempt
    def ver_ticket(self, request, pk=None):
        """Preview embebido del comprobante subido por el empleado (mismo
        patron que PldContraparteDocViewSet.ver, "usa lo mismo que en pld"
        - 04/Sep/2026): sirve el archivo EN STREAMING a traves de
        tesoreria-service en vez de mandar al link crudo de Drive, cuyo
        acceso lo decidiria el ACL de Google en vez del rol de CumbresBI.
        get_object ya aplica el mismo scope que list/retrieve (dueño o
        tesoreria.editar)."""
        ticket = self.get_object()
        return _servir_documento_drive(
            request,
            drive_file_id=ticket.drive_file_id_ticket,
            mime_type=ticket.mime_type_ticket,
            nombre_archivo=f"ticket-{ticket.id_ticket}",
            carpeta=f"Tesoreria/Facturas/TicketsReembolso/{ticket.id_ticket}",
        )

    @action(detail=True, methods=["get"])
    @xframe_options_exempt
    def ver_factura(self, request, pk=None):
        """Preview embebido del PDF de factura en staging - mismo criterio
        que ver_ticket."""
        ticket = self.get_object()
        return _servir_documento_drive(
            request,
            drive_file_id=ticket.drive_file_id_factura,
            mime_type=ticket.mime_type_factura,
            nombre_archivo=f"factura-{ticket.id_ticket}",
            carpeta=f"Tesoreria/Facturas/TicketsReembolso/{ticket.id_ticket}",
        )

    @action(detail=True, methods=["post"])
    def vincular_factura(self, request, pk=None):
        """Liga el ticket a la factura formal YA dada de alta en Facturas
        (mismo criterio que TesoreriaFlujoViewSet.vincular_factura: recibe
        timbre_uuid, valida que exista de verdad) - solo desde APROBADO.
        Marca el ticket como VINCULADO (facturado). Requiere
        tesoreria.editar."""
        ticket = self.get_object()
        if ticket.estado != TesoreriaTicketReembolso.ESTADO_APROBADO:
            return Response({"estado": ["El ticket debe estar Aprobado antes de vincular la factura."]}, status=400)
        timbre_uuid = request.data.get("factura")
        if not timbre_uuid:
            return Response({"factura": ["Este campo es requerido."]}, status=400)
        try:
            ticket.factura = TesoreriaFactura.objects.get(timbre_uuid=timbre_uuid)
        except TesoreriaFactura.DoesNotExist:
            return Response({"factura": ["No existe una factura con ese UUID."]}, status=400)
        ticket.estado = TesoreriaTicketReembolso.ESTADO_VINCULADO
        ticket.save(update_fields=["factura", "estado"])
        emitir_evento_auditoria(
            "tesoreria_tickets_reembolso.vincular_factura",
            "tesoreria_tickets_reembolso",
            ticket.id_ticket,
            actor_user_id=request.data.get("actor_user_id"),
            valores_nuevos={"factura": timbre_uuid},
        )
        return Response(self.get_serializer(ticket).data)

    @action(detail=True, methods=["post"])
    def vincular_flujo(self, request, pk=None):
        """Liga el ticket al TesoreriaFlujo real del pago (el reembolso ya
        procesado en Flujos, tesoreria_flujos.reembolso=True) - paso final
        una vez facturado. Requiere tesoreria.editar."""
        ticket = self.get_object()
        id_flujo = request.data.get("flujo")
        if not id_flujo:
            return Response({"flujo": ["Este campo es requerido."]}, status=400)
        try:
            ticket.flujo = TesoreriaFlujo.objects.get(id_flujo=id_flujo)
        except TesoreriaFlujo.DoesNotExist:
            return Response({"flujo": ["No existe un flujo con ese ID."]}, status=400)
        ticket.save(update_fields=["flujo"])
        emitir_evento_auditoria(
            "tesoreria_tickets_reembolso.vincular_flujo",
            "tesoreria_tickets_reembolso",
            ticket.id_ticket,
            actor_user_id=request.data.get("actor_user_id"),
            valores_nuevos={"flujo": id_flujo},
        )
        return Response(self.get_serializer(ticket).data)


class TesoreriaSolicitudPagoViewSet(ModelViewSet):
    """Solicitud de pago de servicios/licencias/renovaciones (04/Sep/2026,
    ver docstring del modelo). A diferencia de TesoreriaTicketReembolso
    (abierto a cualquier empleado via _EsEmpleadoAutenticado), aqui `crear`
    exige el permiso real `solicitud-pago.crear` - "no todos los
    colaboradores pueden solicitar pago" (Mariana). `aprobar`/`rechazar`
    exigen `solicitud-pago.aprobar` en vez de `.editar` (a diferencia de
    TesoreriaTicketReembolsoViewSet) para reforzar la separacion de
    funciones: TESORERIA_ANALISTA tiene `.crear` pero NO `.aprobar` en el
    seed de permission_matrix.py - quien solicita no se autoriza a si
    mismo."""

    serializer_class = TesoreriaSolicitudPagoSerializer
    filter_backends = [SearchFilter]
    search_fields = ["id_solicitud", "descripcion", "proyecto"]

    def get_permissions(self):
        if self.action in ("create", "subir_comprobante"):
            return [require_permission("solicitud-pago.crear")()]
        if self.action in ("aprobar", "rechazar"):
            return [require_permission("solicitud-pago.aprobar")()]
        if self.action in ("update", "partial_update", "destroy", "vincular_factura", "vincular_flujo"):
            return [require_permission("solicitud-pago.editar")()]
        return super().get_permissions()

    def get_queryset(self):
        queryset = (
            TesoreriaSolicitudPago.objects.for_scope(self.request.effective_scope)
            .select_related("flujo")
            .order_by("-created_at")
        )
        proyecto = self.request.query_params.get("proyecto")
        if proyecto:
            queryset = queryset.filter(proyecto=proyecto)
        sociedad = self.request.query_params.get("sociedad")
        if sociedad:
            queryset = queryset.filter(sociedad=sociedad)
        return queryset

    def perform_create(self, serializer):
        # id_solicitud = "SPG-{consecutivo global de 6 digitos}", mismo
        # criterio que TesoreriaTicketReembolso.id_ticket.
        consecutivo = TesoreriaSolicitudPago.objects.count() + 1
        serializer.save(
            id_solicitud=f"SPG-{consecutivo:06d}",
            solicitado_por=self.request.effective_scope.identity_user_id,
            created_by=self.request.effective_scope.identity_user_id,
        )

    @action(detail=True, methods=["post"], parser_classes=[MultiPartParser])
    def subir_comprobante(self, request, pk=None):
        """Comprobante OPCIONAL (recibo oficial, linea de captura pagada, o
        CFDI si la dependencia lo emite - ver docstring del modelo). Mismo
        patron de subida que TesoreriaTicketReembolsoViewSet.subir_ticket,
        pero sin exigir estado ni bloquear el flujo si nunca se sube."""
        solicitud = self.get_object()
        archivo = request.FILES.get("file")
        if not archivo:
            return Response({"detail": "Campo 'file' requerido"}, status=400)

        resultado, error = _subir_a_drive(
            request, archivo, f"Tesoreria/SolicitudesPago/{solicitud.id_solicitud}"
        )
        if error:
            return error

        solicitud.link_comprobante = resultado["web_view_link"]
        solicitud.drive_file_id_comprobante = resultado["file_id"]
        solicitud.save(update_fields=["link_comprobante", "drive_file_id_comprobante"])
        emitir_evento_auditoria(
            "tesoreria_solicitudes_pago.subir_comprobante",
            "tesoreria_solicitudes_pago",
            solicitud.id_solicitud,
            actor_user_id=solicitud.solicitado_por,
            valores_nuevos={"nombre_archivo": archivo.name},
        )
        return Response(self.get_serializer(solicitud).data)

    @action(detail=True, methods=["post"])
    def aprobar(self, request, pk=None):
        """Autoriza el pago - autorizado_por/fecha_autorizacion se
        resuelven del JWT (mismo criterio que
        TesoreriaTicketReembolsoViewSet.aprobar). Solo desde PENDIENTE.
        Requiere solicitud-pago.aprobar."""
        solicitud = self.get_object()
        if solicitud.estado != TesoreriaSolicitudPago.ESTADO_PENDIENTE:
            return Response({"estado": ["Solo se puede aprobar una solicitud Pendiente."]}, status=400)
        solicitud.estado = TesoreriaSolicitudPago.ESTADO_APROBADO
        solicitud.autorizado_por = request.effective_scope.identity_user_id
        solicitud.fecha_autorizacion = timezone.now().date()
        solicitud.comentarios = request.data.get("comentarios", solicitud.comentarios)
        solicitud.save(update_fields=["estado", "autorizado_por", "fecha_autorizacion", "comentarios"])
        emitir_evento_auditoria(
            "tesoreria_solicitudes_pago.aprobar",
            "tesoreria_solicitudes_pago",
            solicitud.id_solicitud,
            actor_user_id=request.effective_scope.identity_user_id,
        )
        return Response(self.get_serializer(solicitud).data)

    @action(detail=True, methods=["post"])
    def rechazar(self, request, pk=None):
        """Contraparte de aprobar() - solo desde PENDIENTE. Requiere
        solicitud-pago.aprobar (mismo gate que aprobar, es la contraparte
        de la misma decision)."""
        solicitud = self.get_object()
        if solicitud.estado != TesoreriaSolicitudPago.ESTADO_PENDIENTE:
            return Response({"estado": ["Solo se puede rechazar una solicitud Pendiente."]}, status=400)
        solicitud.estado = TesoreriaSolicitudPago.ESTADO_RECHAZADO
        solicitud.comentarios = request.data.get("comentarios", solicitud.comentarios)
        solicitud.save(update_fields=["estado", "comentarios"])
        emitir_evento_auditoria(
            "tesoreria_solicitudes_pago.rechazar",
            "tesoreria_solicitudes_pago",
            solicitud.id_solicitud,
            actor_user_id=request.effective_scope.identity_user_id,
        )
        return Response(self.get_serializer(solicitud).data)

    @action(detail=True, methods=["post"])
    def vincular_factura(self, request, pk=None):
        """Liga la solicitud a una factura formal YA dada de alta - a
        diferencia de Reembolso, es opcional y no cambia el estado (el
        comprobante de gobierno no siempre es un CFDI, ver docstring del
        modelo); solo desde APROBADO. Requiere solicitud-pago.editar."""
        solicitud = self.get_object()
        if solicitud.estado != TesoreriaSolicitudPago.ESTADO_APROBADO:
            return Response({"estado": ["La solicitud debe estar Aprobada antes de vincular la factura."]}, status=400)
        timbre_uuid = request.data.get("factura")
        if not timbre_uuid:
            return Response({"factura": ["Este campo es requerido."]}, status=400)
        try:
            solicitud.factura = TesoreriaFactura.objects.get(timbre_uuid=timbre_uuid)
        except TesoreriaFactura.DoesNotExist:
            return Response({"factura": ["No existe una factura con ese UUID."]}, status=400)
        solicitud.save(update_fields=["factura"])
        emitir_evento_auditoria(
            "tesoreria_solicitudes_pago.vincular_factura",
            "tesoreria_solicitudes_pago",
            solicitud.id_solicitud,
            actor_user_id=request.effective_scope.identity_user_id,
            valores_nuevos={"factura": timbre_uuid},
        )
        return Response(self.get_serializer(solicitud).data)

    @action(detail=True, methods=["post"])
    def vincular_flujo(self, request, pk=None):
        """Liga la solicitud al TesoreriaFlujo real del pago y la marca
        PAGADO - solo desde APROBADO (con o sin factura ligada). Requiere
        solicitud-pago.editar."""
        solicitud = self.get_object()
        if solicitud.estado != TesoreriaSolicitudPago.ESTADO_APROBADO:
            return Response({"estado": ["La solicitud debe estar Aprobada antes de registrar el pago."]}, status=400)
        id_flujo = request.data.get("flujo")
        if not id_flujo:
            return Response({"flujo": ["Este campo es requerido."]}, status=400)
        try:
            solicitud.flujo = TesoreriaFlujo.objects.get(id_flujo=id_flujo)
        except TesoreriaFlujo.DoesNotExist:
            return Response({"flujo": ["No existe un flujo con ese ID."]}, status=400)
        solicitud.estado = TesoreriaSolicitudPago.ESTADO_PAGADO
        solicitud.save(update_fields=["flujo", "estado"])
        emitir_evento_auditoria(
            "tesoreria_solicitudes_pago.vincular_flujo",
            "tesoreria_solicitudes_pago",
            solicitud.id_solicitud,
            actor_user_id=request.effective_scope.identity_user_id,
            valores_nuevos={"flujo": id_flujo},
        )
        return Response(self.get_serializer(solicitud).data)


def _servir_documento_drive(request, drive_file_id, mime_type, nombre_archivo, carpeta):
    """Sirve un archivo ya subido a Drive EN STREAMING a traves de este
    servicio (mismo patron que PldContraparteDocViewSet.ver en pld-service,
    "usa lo mismo que en pld" - 04/Sep/2026): antes el boton "Ver"
    mandaba al link crudo de Google Drive, cuyo acceso lo decide el ACL/
    grupo de Drive del usuario, no el permiso que tiene en CumbresBI.

    ETag = drive_file_id (igual que PLD) - reabrir el mismo documento no
    repite los 3 saltos (frontend -> tesoreria-service -> drive-service ->
    Google Drive) en cache-hit. Content-Security-Policy frame-ancestors
    permite embeberlo en un <iframe> del frontend, restringido a los
    mismos origenes de CORS_ALLOWED_ORIGINS."""
    if not drive_file_id:
        return Response({"detail": "Este documento todavía no tiene un archivo subido."}, status=404)

    # "-v2" (04/Sep/2026, hallazgo real): antes del fix de Content-Type
    # (drive-service ahora consulta el tipo real, ver driveclient.
    # get_mime_type) el navegador ya habia cacheado una respuesta con
    # Content-Type incorrecto bajo el ETag viejo (solo drive_file_id); un
    # 304 revalida sin re-enviar headers, asi que el cliente seguia
    # reusando el Content-Type malo indefinidamente. Cambiar el ETag una
    # sola vez invalida esa cache vieja en todos los clientes.
    etag = f'"{drive_file_id}-v2"'
    if request.META.get("HTTP_IF_NONE_MATCH") == etag:
        response = HttpResponse(status=304)
        response["ETag"] = etag
        response["Cache-Control"] = "private, max-age=300"
        return response

    headers, cookies = forward_auth_headers(request)
    if settings.DRIVE_INTERNAL_SECRET:
        headers["X-Internal-Secret"] = settings.DRIVE_INTERNAL_SECRET
    try:
        upstream = requests.get(
            f"{settings.DRIVE_SERVICE_URL}/api/download/{drive_file_id}/",
            params={"perm": "tesoreria.editar", "carpeta": carpeta},
            headers=headers,
            cookies=cookies,
            stream=True,
            timeout=30,
        )
    except requests.RequestException:
        logger.warning("drive-service no respondio al servir el documento %s", drive_file_id, exc_info=True)
        return Response({"detail": "El servicio de Drive no respondió. Intenta de nuevo."}, status=502)

    if upstream.status_code != 200:
        detalle = upstream.json() if upstream.content else {"detail": "Error al obtener el archivo de Drive"}
        return Response(detalle, status=upstream.status_code if upstream.status_code in (403, 404) else 502)

    # 04/Sep/2026 (hallazgo real: tickets subidos antes de que este campo
    # existiera tenian mime_type_ticket/factura en NULL, forzando descarga
    # en vez de previsualizar) - drive-service ya consulta el tipo real en
    # Drive (ver DownloadView), asi que su Content-Type manda; el
    # guardado localmente queda solo como respaldo si esa consulta falla.
    content_type = upstream.headers.get("Content-Type") or mime_type or "application/octet-stream"
    response = StreamingHttpResponse(upstream.iter_content(chunk_size=8192), content_type=content_type)
    response["Content-Disposition"] = f'inline; filename="{nombre_archivo}"'
    response["ETag"] = etag
    response["Cache-Control"] = "private, max-age=300"
    origenes = " ".join(settings.CORS_ALLOWED_ORIGINS)
    response["Content-Security-Policy"] = f"frame-ancestors 'self' {origenes}"
    return response


def _subir_a_drive(request, archivo, carpeta):
    """Helper compartido: sube un archivo a drive-service bajo `carpeta`.
    Regresa (resultado_dict, None) si funciono, o (None, Response) con el
    error listo para regresar tal cual desde la vista que lo llamo. Mismo
    codigo que ya vivia inline en TesoreriaFlujoViewSet.subir_comprobante,
    factorizado para reusarlo aqui sin copiar/pegar la llamada a
    requests.post."""
    headers, cookies = forward_auth_headers(request)
    # El empleado que sube su propio ticket (subir_ticket) no tiene ningun
    # perm_key de tesoreria.* - se autoriza via el secreto interno
    # servicio-a-servicio en vez del ?perm= normal (ver drive-service/
    # drive/views.py::_autorizado y settings.DRIVE_INTERNAL_SECRET arriba).
    # Tesoreria (subir_factura) ya paso por require_permission("tesoreria.editar")
    # en la vista antes de llegar aqui, asi que mandar el mismo header no
    # relaja nada para ese caso.
    if settings.DRIVE_INTERNAL_SECRET:
        headers["X-Internal-Secret"] = settings.DRIVE_INTERNAL_SECRET
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
        logger.warning("drive-service no respondio al subir archivo a %s", carpeta, exc_info=True)
        return None, Response({"detail": "El servicio de Drive no respondió. Intenta de nuevo."}, status=502)

    if upstream.status_code != 201:
        return None, Response(
            upstream.json() if upstream.content else {"detail": "Error al subir a Drive"},
            status=upstream.status_code,
        )
    return upstream.json(), None


class TesoreriaTicketProveedorViewSet(ModelViewSet):
    """Ticket publico de un solo uso para que un PROVEEDOR externo suba su
    factura sin login (27/Ago/2026, mismo patron que
    PldTicketClienteViewSet en pld-service, independiente - ver docstring
    del modelo). "validar"/"subir_factura" son publicos (sin sesion);
    crear/revocar son acciones internas de Tesoreria.

    El archivo sube a Tesoreria/Facturas/FacturasProveedores (27/Ago/2026,
    pedido de Mariana: nombre propio, no mezclado con el alta manual) - el
    analista abre "Nueva factura" > Motor Documental apuntando a esa misma
    carpeta, sin necesitar una pantalla de revision aparte para estos
    tickets.

    DELETE no esta permitido conceptualmente: un ticket no se borra, se
    revoca - usa POST /api/tickets-proveedor/{id}/revocar/.

    31/Ago/2026 (auditoria de scope): antes `.all()` sin RLS - cualquiera
    con tesoreria.crear/editar veia los tickets de todos los proveedores.
    sociedad/proyecto los declara el analista al emitir el ticket (la
    contraparte es catalogo compartido, sin alcance propio)."""

    serializer_class = TesoreriaTicketProveedorSerializer
    filter_backends = [SearchFilter]
    search_fields = ["id_ticket", "email", "contraparte__razon_social"]

    def get_permissions(self):
        if self.action in ("validar", "subir_factura"):
            return []
        if self.action == "create":
            return [require_permission("tesoreria.crear")()]
        if self.action == "revocar":
            return [require_permission("tesoreria.editar")()]
        return super().get_permissions()

    def get_queryset(self):
        # "validar"/"subir_factura" (publicos, sin sesion) NO pasan por
        # aqui - resuelven el ticket directo por token via _resolver_ticket,
        # ver mas abajo. Esto solo aplica a list/retrieve/revocar (staff).
        queryset = TesoreriaTicketProveedor.objects.for_scope(self.request.effective_scope).select_related(
            "contraparte"
        )
        # 31/Ago/2026 (pedido de Mariana: "igual en tickets debe tener
        # filtro") - acota la vista sin cambiar el scope real de la sesion.
        sociedad = self.request.query_params.get("sociedad")
        if sociedad:
            queryset = queryset.filter(sociedad=sociedad)
        proyecto = self.request.query_params.get("proyecto")
        if proyecto:
            queryset = queryset.filter(proyecto=proyecto)
        return queryset

    def get_throttles(self):
        # Mismo criterio que PldTicketClienteViewSet: rate limiting solo en
        # la accion cara (recaptcha + subida a Drive), publica sin sesion.
        if self.action == "subir_factura":
            self.throttle_scope = "tesoreria-ticket-subir"
            return [ScopedRateThrottle()]
        return super().get_throttles()

    def perform_create(self, serializer):
        """Genera el token en claro + su hash - el token en claro solo se
        expone una vez, en la respuesta de este create (ver create() abajo),
        nunca se guarda ni se puede recuperar despues."""
        token, token_hash = generate_token()
        self._token_en_claro = token
        serializer.save(token_hash=token_hash)

    def create(self, request, *args, **kwargs):
        response = super().create(request, *args, **kwargs)
        response.data["token"] = self._token_en_claro
        response.data["correo_enviado"] = enviar_correo_ticket_proveedor(
            request, response.data["email"], self._token_en_claro
        )
        return response

    @action(detail=True, methods=["post"])
    def revocar(self, request, pk=None):
        ticket = self.get_object()
        ticket.revoked_at = timezone.now()
        ticket.save(update_fields=["revoked_at"])
        emitir_evento_auditoria(
            "tesoreria_ticket_proveedor.revocar",
            "tesoreria_ticket_proveedor",
            ticket.id_ticket,
            actor_user_id=request.data.get("actor_user_id"),
        )
        return Response(self.get_serializer(ticket).data)

    @staticmethod
    def _resolver_ticket(token):
        """Busca el ticket por su token en claro y valida que siga vigente
        (no revocado, no expirado, no agotado) - compartido entre validar()
        y subir_factura() para no repetir las 3 validaciones en cada
        endpoint publico. Regresa (ticket, None) o (None, Response-de-error)."""
        if not token:
            return None, Response({"token": ["Este campo es requerido."]}, status=400)

        try:
            ticket = TesoreriaTicketProveedor.objects.select_related("contraparte").get(token_hash=hash_token(token))
        except TesoreriaTicketProveedor.DoesNotExist:
            return None, Response({"detail": "Token inválido."}, status=404)

        now = timezone.now()
        if ticket.revoked_at is not None:
            return None, Response({"detail": "Este link fue revocado."}, status=403)
        if ticket.expires_at < now:
            return None, Response({"detail": "Este link expiró."}, status=403)
        if ticket.uses_count >= ticket.max_uses:
            return None, Response({"detail": "Este link ya alcanzó su límite de usos."}, status=403)

        return ticket, None

    @action(detail=False, methods=["post"])
    def validar(self, request):
        """Valida un token en claro (recibido en el link) - NO marca uso
        todavia (eso lo hace subir_factura, para no gastar el uso solo por
        abrir la pagina). Regresa el ticket junto con el nombre de la
        contraparte, para que el formulario publico salude al proveedor
        por su nombre."""
        ticket, error = self._resolver_ticket(request.data.get("token"))
        if error:
            return error
        return Response(self.get_serializer(ticket).data)

    @action(detail=False, methods=["post"], parser_classes=[MultiPartParser])
    def subir_factura(self, request):
        """Formulario publico del proveedor: sube su factura (PDF) sin
        sesion, canjeando el token del link. Un solo archivo por llamada
        (a diferencia de PldTicketCliente.subir_documento, que acepta
        varios) - una factura es un solo PDF. Protegido por reCAPTCHA."""
        ticket, error = self._resolver_ticket(request.data.get("token"))
        if error:
            return error

        archivo = request.FILES.get("file")
        if not archivo:
            return Response({"detail": "Campo 'file' requerido"}, status=400)

        if not recaptcha.verificar(request.data.get("recaptcha_token"), request.META.get("REMOTE_ADDR")):
            return Response({"detail": "Verificación reCAPTCHA fallida. Intenta de nuevo."}, status=400)

        # Subcarpeta por proveedor (27/Ago/2026, pedido de Mariana: "igual
        # proveedores se dividen dentro por su id") - id_contraparte, no
        # razon_social, mismo criterio que el resto del proyecto (ej.
        # PLD/Nuevos Clientes/<id_contraparte>) - un nombre puede repetirse
        # o traer caracteres raros para una ruta de Drive, el id nunca.
        resultado, drive_error = _subir_a_drive(
            request, archivo, f"Tesoreria/Facturas/FacturasProveedores/{ticket.contraparte_id}"
        )
        if drive_error:
            return drive_error

        now = timezone.now()
        ticket.uses_count += 1
        ticket.last_used_at = now
        if ticket.first_used_at is None:
            ticket.first_used_at = now
        ticket.save(update_fields=["uses_count", "last_used_at", "first_used_at"])

        emitir_evento_auditoria(
            "tesoreria_ticket_proveedor.subir_factura",
            "tesoreria_ticket_proveedor",
            ticket.id_ticket,
            actor_user_id="externo",
            valores_nuevos={"nombre_archivo": archivo.name},
        )
        return Response({"detail": "Factura subida correctamente. Tesorería la va a procesar en breve.", **resultado})


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
        # ?receptor_rfc= (02/Sep/2026, pedido explicito: "receptor debe ser
        # alguna sociedad" - el receptor de una factura de egreso (la mas
        # comun aqui, CFDI recibido de un proveedor) es una sociedad propia
        # de Cumbres, no un TesoreriaContraparte - por eso el filtro es
        # contra el RFC de general_sociedades, no contra ?contraparte=.
        receptor_rfc = self.request.query_params.get("receptor_rfc")
        if receptor_rfc:
            queryset = queryset.filter(receptor_rfc=receptor_rfc)
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
        # confirmar_extraccion/marcar_estado/enviar_masivo son el flujo de
        # revision (IA propone -> humano confirma, o cambia el estado del
        # proceso), no edicion manual del CFDI - se gatean con
        # facturacion-cfdi.aprobar para que TESORERIA_ANALISTA/
        # FINANZAS_MANAGER las conserven aunque perdieron crear/editar
        # (finanzas.md: "the user cannot create, delete or modify
        # invoices", 26/Ago/2026 - ver permission_matrix.py).
        if self.action in ("confirmar_extraccion", "marcar_estado", "enviar_masivo"):
            return [require_permission("facturacion-cfdi.aprobar")()]
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
            return Response({"estado": ["Estado inválido."]}, status=400)

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
        # Ver comentario equivalente en TesoreriaFacturaViewSet.
        receptor_rfc = self.request.query_params.get("receptor_rfc")
        if receptor_rfc:
            queryset = queryset.filter(receptor_rfc=receptor_rfc)
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
        # Ver comentario equivalente en TesoreriaFacturaViewSet.
        receptor_rfc = self.request.query_params.get("receptor_rfc")
        if receptor_rfc:
            queryset = queryset.filter(receptor_rfc=receptor_rfc)
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
