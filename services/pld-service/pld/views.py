import logging

import requests
from cumbresbi_scope import forward_auth_headers
from cumbresbi_scope.permissions import require_permission
from django.conf import settings
from django.utils import timezone
from rest_framework.decorators import action
from rest_framework.filters import SearchFilter
from rest_framework.parsers import MultiPartParser
from rest_framework.response import Response
from rest_framework.throttling import ScopedRateThrottle
from rest_framework.viewsets import ModelViewSet

from .audit_utils import contexto_kyc, emitir_evento_auditoria
from .models import PldContraparteDoc, PldContraparteKyc, PldTicketCliente
from .serializers import (
    PldContraparteDocSerializer,
    PldContraparteKycSerializer,
    PldTicketClienteSerializer,
)
from . import recaptcha
from .mail_utils import enviar_correo_ticket_cliente
from .signals import recalcular_estado_llenado
from .ticket_utils import generate_token, hash_token

logger = logging.getLogger(__name__)


def _limpiar_documentos_borrados_en_drive(kyc, headers, cookies):
    """Revisa contra Drive real cada documento de `kyc` que tenga
    drive_file_id y BORRA de la base de datos los que ya no existen -
    alguien los elimino directo en drive.google.com sin pasar por la app
    (18/Ago/2026, hallazgo real de Mariana: la plataforma se quedaba
    mostrandolos como si siguieran ahi). Decision de Mariana: borrado real
    del registro, no solo marcarlo/ocultarlo - un documento sin archivo
    real detras no aporta nada al expediente.

    Compartido entre el boton interno "Verificar en Drive"
    (PldContraparteKycViewSet.verificar_documentos, con headers/cookies del
    JWT del analista) y el canje del link publico
    (PldTicketClienteViewSet.validar, con el secreto interno
    servicio-a-servicio en headers - el cliente externo no tiene JWT que
    reenviar) - la verificacion debe pasar justo donde el usuario externo
    ve/sube sus documentos, no solo en la pantalla interna del analista.

    Documentos sin drive_file_id (nunca se llego a subir el archivo real)
    se omiten - no hay nada que verificar. Regresa la lista de documentos
    borrados (para avisar en pantalla) - no lanza si drive-service no
    responde, ese documento simplemente se deja como estaba (fail-safe: un
    problema de red no debe borrar evidencia real por error)."""
    carpeta = f"PLD/Nuevos Clientes/{kyc.id_contraparte}"
    eliminados = []

    for doc in kyc.documentos.exclude(drive_file_id__isnull=True).exclude(drive_file_id=""):
        try:
            upstream = requests.get(
                f"{settings.DRIVE_SERVICE_URL}/api/existe/{doc.drive_file_id}/",
                params={"perm": "pld-compliance.leer", "carpeta": carpeta},
                headers=headers,
                cookies=cookies,
                timeout=15,
            )
        except requests.RequestException:
            logger.warning(
                "drive-service no respondio al verificar el documento %s", doc.id_kyc_doc, exc_info=True
            )
            continue

        if upstream.status_code != 200:
            continue

        if not upstream.json().get("existe", True):
            eliminados.append({"id_kyc_doc": doc.id_kyc_doc, "denominacion": doc.denominacion})
            # Auditoria ANTES del delete (18/Ago/2026) - un borrado silencioso
            # de evidencia KYC, aunque sea por sincronia automatica con
            # Drive, sigue siendo una decision sobre el expediente de un
            # cliente y debe quedar en la bitacora con el mismo contexto que
            # cualquier otra accion del Motor Documental (ver
            # pld/audit_utils.py::contexto_kyc).
            emitir_evento_auditoria(
                "pld_contrapartes_docs.eliminar_por_sincronia_drive",
                "pld_contrapartes_docs",
                str(doc.id_kyc_doc),
                actor_user_id="sistema-sincronia-drive",
                valores_previos={"denominacion": doc.denominacion, "drive_file_id": doc.drive_file_id},
                valores_nuevos={**contexto_kyc(kyc), "denominacion": doc.denominacion},
            )
            doc.delete()

    return eliminados


# Limites del lote publico de documentos (18/Ago/2026, ver
# PldTicketClienteViewSet.subir_documento) - antes solo dependian del
# default de Django (DATA_UPLOAD_MAX_MEMORY_SIZE=2.5MB para el cuerpo
# COMPLETO del multipart, sumando todos los archivos), lo que rechazaba de
# golpe cualquier lote de 2+ archivos reales (ej. INE 1MB + CURP 2MB) con un
# "RequestDataTooBig" generico, sin explicarle nada al cliente - "subir uno
# por uno" funcionaba de pura casualidad porque un solo archivo quedaba bajo
# el limite. Ahora se valida explicito por cantidad y por archivo, con un
# mensaje claro, y el limite global de Django (settings.py) se sube lo
# suficiente para permitir el lote completo.
MAX_ARCHIVOS_POR_LOTE = 5
MAX_TAMANO_ARCHIVO_MB = 2
MAX_TAMANO_ARCHIVO_BYTES = MAX_TAMANO_ARCHIVO_MB * 1024 * 1024


class PldContraparteKycViewSet(ModelViewSet):
    """Expediente KYC (Fase 2, Semana 7: "Modelos de expediente KYC y
    contraparte propia"). Alcance real por sociedad ya conectado
    (ScopedManager, ver get_queryset) y ahora tambien permisos reales de
    escritura (cumplimiento real de permisos, plan Fase 1): crear/editar
    requiere PLD_ANALISTA (o quien tenga "pld-compliance.crear"/"editar"),
    aprobar requiere el rol distinto PLD_APROBADOR (segregacion de
    funciones documentada en roles-y-permisos.md sec. 2 - "quien captura
    no aprueba").

    Filtros: ?estado_llenado=PENDIENTE|INCOMPLETO|ENTREGADO. Busqueda de
    texto libre (?search=) sobre id_contraparte/curp.
    """

    queryset = PldContraparteKyc.objects.all().order_by("-created_at")
    serializer_class = PldContraparteKycSerializer
    filter_backends = [SearchFilter]
    search_fields = ["id_contraparte", "curp"]

    def get_permissions(self):
        if self.action == "create":
            return [require_permission("pld-compliance.crear")()]
        if self.action in (
            "update",
            "partial_update",
            "confirmar_extraccion",
            "reactivar_auto_estado",
            "verificar_documentos",
        ):
            return [require_permission("pld-compliance.editar")()]
        if self.action in ("aprobar", "marcar_sospechoso", "congelar", "reactivar_cuenta"):
            return [require_permission("pld-compliance.aprobar")()]
        return super().get_permissions()

    def get_queryset(self):
        queryset = PldContraparteKyc.objects.for_scope(self.request.effective_scope).order_by(
            "-created_at"
        )
        estado_llenado = self.request.query_params.get("estado_llenado")
        if estado_llenado:
            queryset = queryset.filter(estado_llenado=estado_llenado.upper())
        return queryset

    # Campos del expediente que el Motor Documental puede llenar con datos ya
    # validados por el analista (docint/prompts.py: los nombres de
    # extracted_data ya estan alineados a estas columnas a proposito, para
    # que el frontend pueda mandarlos casi tal cual, ver
    # MotorDocumentalDialog.tsx). Whitelist explicita para no permitir que
    # confirmar_extraccion escriba campos fuera de este conjunto (ej.
    # aprobado_por/aprobado_en, que tienen su propio flujo en aprobar()).
    CAMPOS_CONFIRMABLES = {
        "nombre_completo",
        "fecha_nac_const",
        "pais_nac_const",
        "folio_mercantil",
        "objeto_social",
        "curp",
        "nacionalidad",
        "ocupacion_act_economica",
        "dom_calle",
        "dom_numero_ext",
        "dom_numero_int",
        "dom_colonia",
        "dom_municipio_alcaldia",
        "dom_estado",
        "dom_cp",
        "dom_pais",
        "tipo_identificacion",
        "autoridad_identificacion",
        "numero_identificacion",
        "dom_corresp_dom_calle",
        "dom_corresp_dom_numero_ext",
        "dom_corresp_dom_numero_int",
        "dom_corresp_dom_colonia",
        "dom_corresp_dom_municipio_alcaldia",
        "dom_corresp_dom_estado",
        "dom_corresp_dom_cp",
        "dom_corresp_dom_pais",
        "telefono_fijo",
        "telefono_sms",
        "estado_civil",
        "ident_fideicomiso",
        "comentarios",
    }

    # El Motor Documental extrae el nombre con una llave distinta segun el
    # tipo de documento (docint/prompts.py): "nombre_completo" (INE/CURP/acta
    # de nacimiento, persona fisica), "razon_social" (acta constitutiva) y
    # "razon_social_o_nombre" (constancia de situacion fiscal) - las 3 se
    # unifican en el mismo campo del modelo (nombre_completo), mismo criterio
    # que fecha_nac_const/pais_nac_const ya unifican fisica/moral. Se
    # traducen aqui, antes del filtro de CAMPOS_CONFIRMABLES, en vez de
    # agregar 3 columnas que guardarian el mismo dato (18/Ago/2026, hallazgo:
    # antes ninguna de las 3 se guardaba, "nombre_completo" era el ejemplo
    # citado de "dato sin columna propia").
    ALIAS_CAMPOS = {
        "razon_social": "nombre_completo",
        "razon_social_o_nombre": "nombre_completo",
    }

    @action(detail=True, methods=["post"])
    def confirmar_extraccion(self, request, pk=None):
        """Guarda en el expediente los datos que salieron del Motor
        Documental (docint AnalyzeView) DESPUES de que el analista los revisó
        y corrigió en pantalla - ver docs/architecture/pld-fase2-alcance.md y
        memoria de sesion "pld-flujo-extraccion-vs-archivo": la IA propone,
        un humano confirma antes de que el dato quede como verdad de negocio.

        Body: {"campos": {<nombre_de_campo>: <valor>, ...}} - solo se
        aceptan campos en CAMPOS_CONFIRMABLES (traducidos primero via
        ALIAS_CAMPOS); cualquier otra llave se ignora silenciosamente (datos
        informativos de la extraccion sin columna propia en este modelo).
        Mismo permiso que editar el expediente a mano (pld-compliance.editar)
        - confirmar una extraccion es una forma de edicion, no una accion
        distinta con su propia regla de acceso."""
        campos = request.data.get("campos")
        if not isinstance(campos, dict) or not campos:
            return Response({"detail": "Se requiere 'campos' (objeto no vacío)."}, status=400)
        campos = {self.ALIAS_CAMPOS.get(k, k): v for k, v in campos.items()}

        datos_validos = {k: v for k, v in campos.items() if k in self.CAMPOS_CONFIRMABLES}
        if not datos_validos:
            return Response(
                {"detail": "Ninguno de los campos enviados es confirmable en el expediente."},
                status=400,
            )

        kyc = self.get_object()
        serializer = self.get_serializer(kyc, data=datos_validos, partial=True)
        serializer.is_valid(raise_exception=True)
        serializer.save()
        emitir_evento_auditoria(
            "pld_contrapartes_kyc.confirmar_extraccion",
            "pld_contrapartes_kyc",
            str(kyc.id_kyc),
            actor_user_id=request.data.get("actor_user_id"),
            valores_nuevos={**contexto_kyc(kyc), "campos": datos_validos},
        )
        return Response(serializer.data)

    @action(detail=True, methods=["post"])
    def verificar_documentos(self, request, pk=None):
        """Botón interno "Verificar en Drive" - revisa contra Drive real
        cada documento del expediente y BORRA los que ya no existen (ver
        _limpiar_documentos_borrados_en_drive). Manual en vez de polling
        automático - Drive no tiene webhooks configurados todavía y cada
        documento implica una llamada aparte a drive-service, no algo para
        correr en cada carga de pantalla.

        Regresa el expediente actualizado (ya sin los documentos borrados)
        más "documentos_eliminados" con lo que se quitó, para que el
        frontend pueda avisarle al analista qué desapareció."""
        kyc = self.get_object()
        headers, cookies = forward_auth_headers(request)
        eliminados = _limpiar_documentos_borrados_en_drive(kyc, headers, cookies)

        kyc.refresh_from_db()
        data = self.get_serializer(kyc).data
        data["documentos_eliminados"] = eliminados
        return Response(data)

    @action(detail=True, methods=["post"])
    def reactivar_auto_estado(self, request, pk=None):
        """Apaga estado_llenado_manual y recalcula de inmediato segun el
        status actual de los documentos del expediente (docs/architecture/
        pld-fase2-alcance.md sec. 3, workflow hibrido) - para cuando el
        analista quiere devolverle el control automatico a un expediente
        que el mismo edito a mano antes. Mismo permiso que editar el
        expediente (no es una accion distinta con su propia regla)."""
        kyc = self.get_object()
        kyc.estado_llenado_manual = False
        kyc.save(update_fields=["estado_llenado_manual"])
        recalcular_estado_llenado(kyc)
        kyc.refresh_from_db()
        return Response(self.get_serializer(kyc).data)

    @action(detail=True, methods=["post"])
    def aprobar(self, request, pk=None):
        """Marca el expediente como aprobado (aprobado_por/aprobado_en), sin
        modificar estado_llenado - son campos independientes en el modelo
        heredado (ver models.py). aprobado_por es requerido porque el modelo
        no admite blank/null y todavia no hay JWT real para resolverlo del
        request (ver nota de clase arriba)."""
        aprobado_por = request.data.get("aprobado_por")
        if not aprobado_por:
            return Response({"aprobado_por": ["Este campo es requerido."]}, status=400)

        kyc = self.get_object()
        kyc.aprobado_por = aprobado_por
        kyc.aprobado_en = timezone.now()
        kyc.save(update_fields=["aprobado_por", "aprobado_en"])
        emitir_evento_auditoria(
            "pld_contrapartes_kyc.aprobar",
            "pld_contrapartes_kyc",
            str(kyc.id_kyc),
            actor_user_id=aprobado_por,
            valores_nuevos=contexto_kyc(kyc),
        )
        return Response(self.get_serializer(kyc).data)

    # Tres acciones del "semaforo" de estado_cuenta (17/Ago/2026, vista de
    # detalle del expediente) - mismo peso de decision que aprobar(), mismo
    # permiso (pld-compliance.aprobar). No son mutuamente excluyentes con
    # estado_llenado/aprobado_en: una cuenta puede estar "Aprobada" (KYC
    # completo) y a la vez "Congelada" (decision operativa posterior, ej.
    # actividad sospechosa detectada despues de aprobar).
    def _set_estado_cuenta(self, request, nuevo_estado, accion):
        kyc = self.get_object()
        estado_anterior = kyc.estado_cuenta
        kyc.estado_cuenta = nuevo_estado
        kyc.save(update_fields=["estado_cuenta"])
        emitir_evento_auditoria(
            accion,
            "pld_contrapartes_kyc",
            str(kyc.id_kyc),
            actor_user_id=request.data.get("actor_user_id"),
            valores_previos={"estado_cuenta": estado_anterior},
            valores_nuevos={**contexto_kyc(kyc), "estado_cuenta": nuevo_estado},
        )
        return Response(self.get_serializer(kyc).data)

    @action(detail=True, methods=["post"])
    def marcar_sospechoso(self, request, pk=None):
        return self._set_estado_cuenta(request, PldContraparteKyc.CUENTA_SOSPECHOSA, "pld_contrapartes_kyc.marcar_sospechoso")

    @action(detail=True, methods=["post"])
    def congelar(self, request, pk=None):
        return self._set_estado_cuenta(request, PldContraparteKyc.CUENTA_CONGELADA, "pld_contrapartes_kyc.congelar")

    @action(detail=True, methods=["post"])
    def reactivar_cuenta(self, request, pk=None):
        """Deshace marcar_sospechoso/congelar - vuelve la cuenta a ACTIVA."""
        return self._set_estado_cuenta(request, PldContraparteKyc.CUENTA_ACTIVA, "pld_contrapartes_kyc.reactivar_cuenta")


class PldContraparteDocViewSet(ModelViewSet):
    """Documentos del expediente KYC (Fase 2, Semana 7). Estados del
    documento (ver PldContraparteDoc.STATUS_CHOICES): pendiente, incompleto,
    entregado, aprobado - se actualizan via PATCH sobre "status", no hay
    accion dedicada por estado.

    Filtra por ?kyc=<id_kyc> para listar los documentos de un expediente.
    """

    queryset = PldContraparteDoc.objects.all().order_by("-created_at")
    serializer_class = PldContraparteDocSerializer

    def get_permissions(self):
        if self.action in ("create", "subir"):
            return [require_permission("pld-compliance.crear")()]
        # "destroy" agregado 18/Ago/2026 (hallazgo real: no estaba en esta
        # lista, asi que caia al default global de DRF - AllowAny, sin
        # exigir NINGUN permiso ni sesion. Cualquiera podia borrar
        # documentos del expediente). Mismo permiso que editar - borrar un
        # documento (ej. un duplicado, decision de Mariana 18/Ago/2026: se
        # borra manual, no automatico) es una forma de edicion del
        # expediente, no una accion con su propia regla.
        if self.action in ("update", "partial_update", "destroy"):
            return [require_permission("pld-compliance.editar")()]
        return super().get_permissions()

    def get_queryset(self):
        queryset = PldContraparteDoc.objects.for_scope(self.request.effective_scope).order_by(
            "-created_at"
        )
        kyc_param = self.request.query_params.get("kyc")
        if kyc_param:
            queryset = queryset.filter(kyc_id=kyc_param)
        return queryset

    @action(detail=True, methods=["post"], parser_classes=[MultiPartParser])
    def subir(self, request, pk=None):
        """Sube el archivo real de este documento a Drive (via drive-service,
        docs/architecture/pld-fase2-alcance.md sec. 1.4) y guarda la
        referencia (drive_file_id/mime_type/tamano_bytes/subido_en) - separado
        de create() porque el registro de metadata (denominacion, fecha
        limite, etc.) puede existir antes de que llegue el archivo real
        (documento "solicitado" pendiente de entrega).

        Reenvia el JWT del usuario original a drive-service (Authorization
        header o cookie de sesion) para que el permiso lo siga decidiendo el
        rol de quien sube, no una credencial propia de pld-service."""
        doc = self.get_object()
        archivo = request.FILES.get("file")
        if not archivo:
            return Response({"detail": "Campo 'file' requerido"}, status=400)

        headers, cookies = forward_auth_headers(request)
        # "Nuevos Clientes" (17/Ago/2026, pedido de Mariana): subcarpeta fija
        # dentro de la Unidad compartida PLD_CumbresBI - antes se creaba la
        # carpeta del cliente directo en la raiz.
        carpeta = f"PLD/Nuevos Clientes/{doc.kyc.id_contraparte}"
        try:
            upstream = requests.post(
                f"{settings.DRIVE_SERVICE_URL}/api/upload/",
                params={"perm": "pld-compliance.crear"},
                files={"file": (archivo.name, archivo.read(), archivo.content_type)},
                data={"carpeta": carpeta},
                headers=headers,
                cookies=cookies,
                timeout=30,
            )
        except requests.RequestException:
            logger.warning("drive-service no respondio al subir documento %s", doc.id_kyc_doc, exc_info=True)
            return Response({"detail": "El servicio de Drive no respondió. Intenta de nuevo."}, status=502)

        if upstream.status_code != 201:
            return Response(upstream.json() if upstream.content else {"detail": "Error al subir a Drive"}, status=upstream.status_code)

        resultado = upstream.json()
        doc.drive_file_id = resultado["file_id"]
        doc.link_documento = resultado["web_view_link"]
        doc.mime_type = resultado["mime_type"]
        doc.tamano_bytes = resultado["tamano_bytes"]
        doc.subido_en = timezone.now()
        doc.save(update_fields=["drive_file_id", "link_documento", "mime_type", "tamano_bytes", "subido_en"])

        emitir_evento_auditoria(
            "pld_contrapartes_docs.subir",
            "pld_contrapartes_docs",
            str(doc.id_kyc_doc),
            actor_user_id=request.data.get("actor_user_id"),
            valores_nuevos={**contexto_kyc(doc.kyc), "denominacion": doc.denominacion, "nombre_archivo": archivo.name},
        )
        return Response(self.get_serializer(doc).data)

    def destroy(self, request, *args, **kwargs):
        """Override del destroy generico de DRF (18/Ago/2026) - eliminar un
        documento del expediente (ej. un duplicado, ver comentario en
        get_permissions arriba) es una decision sobre evidencia KYC de un
        cliente real y debe quedar auditada igual que subir/aprobar, no solo
        gateada por permiso."""
        doc = self.get_object()
        contexto = {**contexto_kyc(doc.kyc), "denominacion": doc.denominacion, "drive_file_id": doc.drive_file_id}
        doc_id = str(doc.id_kyc_doc)
        response = super().destroy(request, *args, **kwargs)
        emitir_evento_auditoria(
            "pld_contrapartes_docs.eliminar",
            "pld_contrapartes_docs",
            doc_id,
            actor_user_id=request.data.get("actor_user_id"),
            valores_previos=contexto,
        )
        return response


class PldTicketClienteViewSet(ModelViewSet):
    """Magic link de KYC externo (Fase 2, Semana 9: "Workflow de expediente
    y formularios públicos"). Mismo patrón que IamMagicLinkViewSet
    (iam-service), pero sin emisión de JWT propio - pld-service no tiene
    llave privada (solo verifica el JWT de cumbresbi_scope, ver
    config/settings.py); "validar" regresa el ticket/expediente directamente.

    Permisos reales ya conectados (ver get_permissions abajo): crear/revocar
    requieren "pld-compliance.crear"/"editar" - "validar" sigue publico, el
    cliente externo canjea por token, sin sesion previa.

    DELETE no está permitido conceptualmente: un ticket no se borra, se
    revoca - usa POST /api/ticket-cliente/{id}/revocar/.
    """

    queryset = PldTicketCliente.objects.all().order_by("-issued_at")
    serializer_class = PldTicketClienteSerializer

    def get_permissions(self):
        # "validar", "subir_documento" y "actualizar_datos" son publicos (el
        # cliente externo canjea su ticket sin sesion, ver
        # iam-magic-link-alcance) - crear/revocar el ticket es accion
        # interna de PLD.
        if self.action in ("validar", "subir_documento", "actualizar_datos"):
            return []
        if self.action == "create":
            return [require_permission("pld-compliance.crear")()]
        if self.action == "revocar":
            return [require_permission("pld-compliance.editar")()]
        return super().get_permissions()

    def get_throttles(self):
        # Rate limiting solo en subir_documento (docs/architecture/
        # pld-fase2-alcance.md sec. 2, pregunta abierta #4) - es la accion
        # cara (recaptcha + subida a Drive) y publica sin sesion; "validar"
        # se deja sin limite propio por ahora (solo canjea el token).
        if self.action == "subir_documento":
            self.throttle_scope = "pld-ticket-subir"
            return [ScopedRateThrottle()]
        return super().get_throttles()

    def get_queryset(self):
        # Sin ScopedManager a proposito: mismo criterio que IamMagicLink
        # (ver memoria de sesion "iam-magic-link-alcance") - el cliente
        # externo canjea el ticket por su token, sin sesion/alcance previo.
        queryset = super().get_queryset()
        kyc_param = self.request.query_params.get("kyc")
        if kyc_param:
            queryset = queryset.filter(kyc_id=kyc_param)
        return queryset

    def perform_create(self, serializer):
        """Genera el token en claro + su hash. El token en claro solo se
        expone una vez, en la respuesta de este create (ver create() abajo) -
        nunca se guarda ni se puede recuperar después."""
        token, token_hash = generate_token()
        self._token_en_claro = token
        serializer.save(token_hash=token_hash)

    def create(self, request, *args, **kwargs):
        response = super().create(request, *args, **kwargs)
        response.data["token"] = self._token_en_claro
        # Envio real por correo (13/Ago/2026, ver mail_utils.py) - el token
        # se sigue regresando en la respuesta como respaldo (ver
        # docstring de mail_utils.enviar_correo_ticket_cliente), no lo
        # reemplaza.
        response.data["correo_enviado"] = enviar_correo_ticket_cliente(
            request, response.data["email"], self._token_en_claro
        )
        return response

    @staticmethod
    def _resolver_ticket(token):
        """Busca el ticket por su token en claro y valida que siga vigente
        (no revocado, no expirado, no agotado) - compartido entre validar()
        y subir_documento() para no repetir las 3 validaciones en cada
        endpoint publico. Regresa (ticket, None) o (None, Response-de-error)."""
        if not token:
            return None, Response({"token": ["Este campo es requerido."]}, status=400)

        try:
            ticket = PldTicketCliente.objects.get(token_hash=hash_token(token))
        except PldTicketCliente.DoesNotExist:
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
        """Valida un token en claro (recibido en el link) y, si es válido,
        marca su uso. Regresa el ticket junto con el expediente KYC asociado
        (si tiene uno) para que el formulario público sepa sobre qué
        expediente está trabajando y qué documentos ya tiene subidos.

        Limpieza contra Drive (18/Ago/2026, decisión de Mariana: la
        verificación debe pasar justo donde el usuario externo ve/sube sus
        documentos, no solo en la pantalla interna del analista) - cada vez
        que el cliente abre su link, se revisan sus documentos contra Drive
        real y se borran los que ya no existen (ver
        _limpiar_documentos_borrados_en_drive), ANTES de serializar el kyc -
        así "kyc.documentos" en la respuesta ya refleja el estado real, sin
        registros fantasma de archivos borrados directo en drive.google.com.
        Usa el secreto interno servicio-a-servicio (no hay JWT de usuario
        que reenviar en este flujo público, mismo criterio que
        subir_documento)."""
        ticket, error = self._resolver_ticket(request.data.get("token"))
        if error:
            return error

        now = timezone.now()
        ticket.uses_count += 1
        ticket.last_used_at = now
        if ticket.first_used_at is None:
            ticket.first_used_at = now
        ticket.save(update_fields=["uses_count", "last_used_at", "first_used_at"])

        data = self.get_serializer(ticket).data
        if ticket.kyc_id:
            headers = {}
            if settings.DRIVE_INTERNAL_SECRET:
                headers["X-Internal-Secret"] = settings.DRIVE_INTERNAL_SECRET
            documentos_eliminados = _limpiar_documentos_borrados_en_drive(ticket.kyc, headers, {})
            ticket.kyc.refresh_from_db()
            data["kyc"] = PldContraparteKycSerializer(ticket.kyc).data
            data["documentos_eliminados"] = documentos_eliminados
        return Response(data)

    @action(detail=False, methods=["post"], parser_classes=[MultiPartParser])
    def subir_documento(self, request):
        """Formulario público de KYC externo (docs/architecture/
        pld-fase2-alcance.md sec. 2): el cliente sube uno o varios
        documentos sin sesión, canjeando el mismo token del link (no
        consume `uses_count` de nuevo aquí - eso ya lo maneja "validar",
        que la página pública llama al cargar; subir varios documentos bajo
        un mismo link válido no debe agotarlo de golpe).

        Acepta varios archivos en la misma petición (campo 'file' repetido,
        ver request.FILES.getlist) - decisión de Mariana 17/Ago/2026: un
        reCAPTCHA real de Google solo es válido una vez, así que pedirle al
        cliente resolverlo por cada archivo sería mala experiencia. Se
        verifica reCAPTCHA UNA sola vez para todo el lote, y cada archivo
        sube a Drive y crea su propio PldContraparteDoc por separado - si
        uno falla a la mitad, los que ya se subieron/crearon quedan (no es
        atómico, ver 'resultados' en la respuesta para saber cuáles sí y
        cuáles no).

        El archivo se sube a Drive vía drive-service usando el secreto
        interno servicio-a-servicio (no hay JWT de usuario que reenviar -
        ver settings.DRIVE_INTERNAL_SECRET), a la misma carpeta que usaría
        un analista interno (mismo flujo de Drive, decisión de Mariana
        12/Ago/2026). Crea el PldContraparteDoc en el momento (denominación
        libre que manda el cliente), no requiere que un analista lo haya
        pre-creado antes.
        """
        ticket, error = self._resolver_ticket(request.data.get("token"))
        if error:
            return error
        if not ticket.kyc_id:
            return Response({"detail": "Este link no tiene un expediente KYC asociado."}, status=400)

        archivos = request.FILES.getlist("file")
        if not archivos:
            return Response({"detail": "Campo 'file' requerido (al menos un archivo)"}, status=400)
        # Validado ANTES del reCAPTCHA (18/Ago/2026) - un lote invalido no
        # debe gastar el token, que solo sirve una vez (ver docstring de
        # arriba). Mensaje explicito en vez de dejar que Django reviente con
        # "RequestDataTooBig" generico al exceder DATA_UPLOAD_MAX_MEMORY_SIZE.
        if len(archivos) > MAX_ARCHIVOS_POR_LOTE:
            return Response(
                {"detail": f"Puedes subir hasta {MAX_ARCHIVOS_POR_LOTE} archivos por lote (elegiste {len(archivos)})."},
                status=400,
            )
        archivos_grandes = [a.name for a in archivos if a.size > MAX_TAMANO_ARCHIVO_BYTES]
        if archivos_grandes:
            return Response(
                {
                    "detail": f"Estos archivos superan el límite de {MAX_TAMANO_ARCHIVO_MB}MB por archivo: "
                    + ", ".join(archivos_grandes)
                },
                status=400,
            )

        if not recaptcha.verificar(request.data.get("recaptcha_token"), request.META.get("REMOTE_ADDR")):
            return Response({"detail": "Verificación reCAPTCHA fallida. Intenta de nuevo."}, status=400)

        carpeta = f"PLD/Nuevos Clientes/{ticket.kyc.id_contraparte}"
        headers = {}
        if settings.DRIVE_INTERNAL_SECRET:
            headers["X-Internal-Secret"] = settings.DRIVE_INTERNAL_SECRET

        resultados = []
        for archivo in archivos:
            try:
                upstream = requests.post(
                    f"{settings.DRIVE_SERVICE_URL}/api/upload/",
                    params={"perm": "pld-compliance.crear"},
                    files={"file": (archivo.name, archivo.read(), archivo.content_type)},
                    data={"carpeta": carpeta},
                    headers=headers,
                    timeout=30,
                )
            except requests.RequestException:
                logger.warning(
                    "drive-service no respondio a la subida publica del ticket %s (%s)",
                    ticket.id_pld_ticket, archivo.name, exc_info=True,
                )
                resultados.append({"nombre_archivo": archivo.name, "ok": False, "detail": "El servicio de Drive no respondió."})
                continue

            if upstream.status_code != 201:
                detalle = upstream.json() if upstream.content else {"detail": "Error al subir a Drive"}
                resultados.append({"nombre_archivo": archivo.name, "ok": False, **detalle})
                continue

            resultado = upstream.json()
            doc = PldContraparteDoc.objects.create(
                kyc=ticket.kyc,
                denominacion=request.data.get("denominacion") or archivo.name,
                status=PldContraparteDoc.STATUS_ENTREGADO,
                drive_file_id=resultado["file_id"],
                link_documento=resultado["web_view_link"],
                mime_type=resultado["mime_type"],
                tamano_bytes=resultado["tamano_bytes"],
                subido_en=timezone.now(),
                created_by="externo",
                updated_by="externo",
            )
            resultados.append({"nombre_archivo": archivo.name, "ok": True, **PldContraparteDocSerializer(doc).data})
            # actor_user_id="externo" (no hay sesion/JWT de usuario en este
            # flujo publico, mismo criterio que created_by/updated_by arriba
            # y que iam_magic_links.use en iam-service/audit_utils) - lo que
            # importa para PLD es que quede claro que fue el cliente quien
            # subio el documento, no un analista.
            emitir_evento_auditoria(
                "pld_contrapartes_docs.subir",
                "pld_contrapartes_docs",
                str(doc.id_kyc_doc),
                actor_user_id="externo",
                valores_nuevos={**contexto_kyc(ticket.kyc), "denominacion": doc.denominacion, "nombre_archivo": archivo.name},
            )

        todos_ok = all(r["ok"] for r in resultados)
        return Response({"resultados": resultados}, status=201 if todos_ok else 207)

    @action(detail=False, methods=["post"])
    def actualizar_datos(self, request):
        """Formulario público de datos de KYC (17/Ago/2026, mismo link que
        subir_documento): el cliente escribe/corrige sus propios datos
        (domicilio, teléfono, CURP, etc.) sin sesión, canjeando el token.

        Reusa PldContraparteKycViewSet.CAMPOS_CONFIRMABLES como whitelist -
        son exactamente los campos de "datos de negocio" del cliente,
        deliberadamente excluidos los internos (aprobado_por, aprobado_en,
        estado_llenado, sociedad_rfc, etc. - esos solo los toca un analista
        desde el panel interno, nunca este endpoint público).

        Body: {"token": ..., "campos": {<nombre_de_campo>: <valor>, ...}} -
        cualquier llave fuera de la whitelist se ignora silenciosamente,
        igual que confirmar_extraccion."""
        ticket, error = self._resolver_ticket(request.data.get("token"))
        if error:
            return error
        if not ticket.kyc_id:
            return Response({"detail": "Este link no tiene un expediente KYC asociado."}, status=400)

        campos = request.data.get("campos")
        if not isinstance(campos, dict) or not campos:
            return Response({"detail": "Se requiere 'campos' (objeto no vacío)."}, status=400)

        datos_validos = {
            k: v for k, v in campos.items() if k in PldContraparteKycViewSet.CAMPOS_CONFIRMABLES
        }
        if not datos_validos:
            return Response(
                {"detail": "Ninguno de los campos enviados es editable por el cliente."}, status=400
            )

        serializer = PldContraparteKycSerializer(ticket.kyc, data=datos_validos, partial=True)
        serializer.is_valid(raise_exception=True)
        serializer.save(updated_by="externo")
        emitir_evento_auditoria(
            "pld_contrapartes_kyc.actualizar_datos",
            "pld_contrapartes_kyc",
            str(ticket.kyc_id),
            actor_user_id="externo",
            valores_nuevos={**contexto_kyc(ticket.kyc), "campos": datos_validos},
        )
        return Response(serializer.data)

    @action(detail=True, methods=["post"])
    def revocar(self, request, pk=None):
        ticket = self.get_object()
        if ticket.revoked_at is None:
            ticket.revoked_at = timezone.now()
            ticket.save(update_fields=["revoked_at"])
        return Response(self.get_serializer(ticket).data)
