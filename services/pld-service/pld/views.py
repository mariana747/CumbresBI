import logging
from urllib.parse import quote

import requests
from cumbresbi_scope import forward_auth_headers
from cumbresbi_scope.permissions import require_permission
from django.conf import settings
from django.http import HttpResponse, StreamingHttpResponse
from django.utils import timezone
from django.views.decorators.clickjacking import xframe_options_exempt
from rest_framework import status
from rest_framework.decorators import action
from rest_framework.filters import SearchFilter
from rest_framework.parsers import MultiPartParser
from rest_framework.response import Response
from rest_framework.throttling import ScopedRateThrottle
from rest_framework.viewsets import ModelViewSet

from .audit_utils import contexto_kyc, emitir_evento_auditoria
from .models import (
    PldContraparteDoc,
    PldContraparteKyc,
    PldRepresentanteLegal,
    PldSolicitudEliminacionDoc,
    PldTicketCliente,
)
from .serializers import (
    PldContraparteDocSerializer,
    PldContraparteKycSerializer,
    PldRepresentanteLegalSerializer,
    PldSolicitudEliminacionDocSerializer,
    PldTicketClienteSerializer,
)
from . import recaptcha
from .mail_utils import enviar_correo_ticket_cliente
from .signals import recalcular_estado_llenado
from .ticket_utils import generate_token, hash_token

logger = logging.getLogger(__name__)


def _carpeta_documento(doc) -> str:
    """Subcarpeta real en Drive para `doc` (04/Sep/2026, checklist de
    proveedores - pendiente desde la peticion del 18/Ago: "si la Unidad
    compartida de Drive necesita subcarpetas por tipo de documento").
    `tipo_documento` es NULL para documentos de identidad generica (esos ya
    viven en Tesoreria, ver docstring del campo en models.py) y para
    documentos subidos por el cliente via el link publico (nunca elige
    tipo_documento) - esos caen en "Generales", sin que eso bloquee nada."""
    subcarpeta = doc.get_tipo_documento_display() if doc.tipo_documento else "Generales"
    return f"PLD/Nuevos Clientes/{doc.kyc.id_contraparte}/{subcarpeta}"


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
    eliminados = []

    for doc in kyc.documentos.exclude(drive_file_id__isnull=True).exclude(drive_file_id=""):
        try:
            upstream = requests.get(
                f"{settings.DRIVE_SERVICE_URL}/api/existe/{doc.drive_file_id}/",
                params={"perm": "pld-compliance.leer", "carpeta": _carpeta_documento(doc)},
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


def _resolver_contraparte_en_tesoreria(id_contraparte, headers, cookies):
    """Verifica contra el catalogo maestro real (tesoreria-service) que
    `id_contraparte` exista, y regresa sus datos VIGENTES - normalmente el
    mismo id que se mando, pero puede resolver a otro si esa contraparte
    se fusiono con otra mientras tanto (02/Sep/2026, cierre real de la
    reconciliacion contraparte maestra - ver
    TesoreriaContraparteViewSet.retrieve/_fusionar_en en tesoreria-service:
    consultar el id de un alias fusionado ya no da 404, da 200 con los
    datos del sobreviviente real). "tesoreria expone el id nuevo, PLD/
    Ventas se actualizan solos" - el llamador usa el id_contraparte del
    dict regresado, no el que mando originalmente.

    Regresa None solo si tesoreria-service confirma con un 404 real que la
    contraparte no existe en absoluto (nunca existio, no es un alias).
    Fail-open, mismo criterio que _obtener_sociedad_en_iam: si
    tesoreria-service no responde o da error, regresa un dict minimo con
    el mismo id_contraparte sin cambios (sin nombre real disponible) - un
    problema de red entre servicios no debe bloquear el alta de un
    expediente KYC real."""
    try:
        upstream = requests.get(
            f"{settings.TESORERIA_SERVICE_URL}/api/contrapartes/{id_contraparte}/",
            headers=headers,
            cookies=cookies,
            timeout=10,
        )
    except requests.RequestException:
        logger.warning(
            "tesoreria-service no respondio al validar id_contraparte %s", id_contraparte, exc_info=True
        )
        return {"id_contraparte": id_contraparte}

    if upstream.status_code == 404:
        return None
    if upstream.status_code != 200:
        # Error real del lado de tesoreria-service (500, 403 por permisos
        # desalineados, etc.) - mismo criterio fail-open que timeout/red.
        logger.warning(
            "tesoreria-service respondio %s al validar id_contraparte %s",
            upstream.status_code,
            id_contraparte,
        )
        return {"id_contraparte": id_contraparte}
    return upstream.json()


def _nombre_completo_de_contraparte(datos_contraparte):
    """Junta razon_social + apellidos de la respuesta de tesoreria-service
    en un solo nombre (02/Sep/2026, hallazgo real: "al crear el expediente
    no se llena el nombre" - PldContraparteKyc.nombre_completo solo se
    llenaba via confirmar_extraccion del Motor Documental, nunca al crear
    el expediente aunque ya se hubiera elegido/creado la contraparte real
    en el selector). Para persona moral/fideicomiso los apellidos vienen
    vacios, razon_social ya es el nombre completo por si solo. Regresa ""
    si no hay nada util todavia (ej. alta autonoma con razon_social
    placeholder "Pendiente de completar...", o si tesoreria-service no
    respondio) - no tiene caso guardar un nombre a medias o el
    placeholder como si fuera el nombre real."""
    if not datos_contraparte:
        return ""
    partes = [
        datos_contraparte.get("razon_social") or "",
        datos_contraparte.get("apellido_paterno") or "",
        datos_contraparte.get("apellido_materno") or "",
    ]
    nombre = " ".join(p.strip() for p in partes if p.strip())
    if nombre.startswith("Pendiente de completar"):
        # El placeholder exacto que usa _crear_contraparte_minima_en_
        # tesoreria() para el alta autonoma (Opcion B, sin contraparte
        # elegida) - mejor dejar el nombre vacio que guardarlo como si
        # fuera el nombre real del cliente. Un nombre real escrito a mano
        # via ContraparteSelector (origen=selector), aunque minimo, SI se
        # usa tal cual - es el nombre real que alguien tecleo.
        return ""
    return nombre


def _crear_contraparte_minima_en_tesoreria():
    """Crea la contraparte real en el catalogo maestro de tesoreria-service
    para el alta autonoma de un expediente KYC (Opcion B, ver
    PldContraparteKyc.id_contraparte en models.py) - 02/Sep/2026, cierre
    real de la reconciliacion contraparte maestra. Antes, cuando el
    analista creaba un expediente sin pasar por el ContraparteSelector
    (sin id_contraparte en el payload), el modelo generaba su propio id
    local (default=_short_id) que nunca existia de verdad en tesoreria-
    service - un huerfano garantizado que _existe_contraparte_en_tesoreria
    no alcanzaba a prevenir porque solo valida cuando SI llega un
    id_contraparte.

    Usa el secreto interno servicio-a-servicio (X-Internal-Secret, ver
    settings.TESORERIA_INTERNAL_SECRET) en vez del JWT del analista - un
    PLD_ANALISTA no necesariamente tiene el permiso tesoreria.crear, y no
    deberia necesitarlo solo para poder abrir un expediente autonomo.
    origen="pld" (ver TesoreriaContraparte.ORIGEN_PLD) exime a
    tesoreria-service de exigir email/tipo_persona - el cliente completa
    los datos reales despues via el link publico de PLD.

    Fail-open, mismo criterio que _existe_contraparte_en_tesoreria: si el
    secreto no esta configurado, tesoreria-service no responde, o rechaza
    la creacion, regresa None y el llamador cae de vuelta al id local
    autogenerado del modelo - un problema de red entre servicios no debe
    bloquear el alta de un expediente KYC real."""
    if not settings.TESORERIA_INTERNAL_SECRET:
        return None
    try:
        upstream = requests.post(
            f"{settings.TESORERIA_SERVICE_URL}/api/contrapartes/",
            json={
                "razon_social": "Pendiente de completar (alta autónoma PLD)",
                "origen": "pld",
                "cliente": True,
            },
            headers={"X-Internal-Secret": settings.TESORERIA_INTERNAL_SECRET},
            timeout=10,
        )
    except requests.RequestException:
        logger.warning("tesoreria-service no respondio al crear la contraparte autonoma de PLD", exc_info=True)
        return None
    if upstream.status_code != 201:
        logger.warning(
            "tesoreria-service rechazo la creacion de la contraparte autonoma de PLD: %s %s",
            upstream.status_code,
            upstream.text[:300],
        )
        return None
    return upstream.json().get("id_contraparte")


def _sincronizar_contraparte_en_tesoreria(id_contraparte, campos):
    """Empuja de vuelta a tesoreria-service los datos que ya se capturaron
    en PLD (02/Sep/2026, pedido explicito: "si en PLD ya dio RFC y
    numero se puede colocar ya en tesoreria... igual lo de tipo de
    persona") - cierra el sentido inverso de la reconciliacion: antes solo
    sincronizabamos tesoreria -> PLD al crear el expediente
    (_resolver_contraparte_en_tesoreria/_nombre_completo_de_contraparte),
    nunca PLD -> tesoreria cuando el analista/cliente completaba datos
    despues via el expediente o el link publico.

    Solo manda los campos que SI tienen columna equivalente en tesoreria-
    service (rfc, tipo_persona, nombre/apellidos, genero, telefono_sms,
    contacto - 02/Sep/2026, pedido explicito: "igual lo de nombre y
    apellidos y genero" + "sincroniza los datos de contacto" + "igual el
    nombre del contacto") - el resto de "datos del cliente" de PLD
    (domicilio, telefono_fijo, etc.) no tiene columna equivalente ahi, se
    quedan solo en el expediente KYC. telefono_fijo NO se sincroniza porque
    tesoreria-service no tiene columna equivalente (solo tiene
    telefono_sms/celular, ver TesoreriaContraparte).

    "contacto" (tesoreria-service) tampoco tiene columna propia en PLD -
    igual que "genero", se deriva: en PLD el contacto SIEMPRE es el
    titular mismo (no existe un contacto distinto, a diferencia de
    tesoreria-service que si permite un tercero - ver el checkbox "El
    contacto es el mismo titular" en tesoreria/contrapartes/page.tsx), asi
    que basta con mandar ahi el nombre completo que ya se este
    sincronizando como razon_social/apellidos en esta misma llamada.

    PLD no tiene una columna PldContraparteKyc.genero propia - "genero" SI
    se sincroniza, pero derivado de la letra H/M en la posicion 11 (indice
    10) de la CURP (unico lugar de PLD donde vive el dato), no copiado de
    un campo con el mismo nombre como el resto de campos_a_sincronizar. Ver
    TesoreriaContraparte.GENERO_HOMBRE/GENERO_MUJER.

    "nombre" de PLD se manda como "razon_social" de tesoreria-service (son
    columnas con nombres distintos para el mismo concepto - el nombre de
    pila de una persona fisica, ver TesoreriaContraparte.razon_social y su
    docstring "Fisica/Fisica con actividad empresarial es SOLO el/los
    nombre(s) de pila").

    Actualizar el rfc en tesoreria-service puede disparar ahi la fusion
    automatica por RFC duplicado (ver TesoreriaContraparteViewSet.update/
    _fusionar_en) si esa contraparte era un huerfano tipo "Pendiente de
    completar (alta autónoma PLD)" y el RFC ya coincide con otra real -
    exactamente el cierre del circulo completo de la reconciliacion.

    Usa el secreto interno servicio-a-servicio (mismo criterio que
    _crear_contraparte_minima_en_tesoreria) - ni el analista ni el cliente
    externo del link publico tienen por que tener tesoreria.editar. Fail-
    open y en segundo plano respecto al guardado real: si esto falla, el
    expediente de PLD ya se guardo bien, solo no se reflejo en tesoreria -
    no vale la pena tronar el request completo por esto."""
    if not settings.TESORERIA_INTERNAL_SECRET:
        return
    # "nombre" (PLD) -> "razon_social" (tesoreria-service) - mismo dato,
    # nombre de columna distinto. El resto (rfc, tipo_persona, apellidos,
    # telefono_sms) ya se llaman igual en los dos servicios.
    MAPEO_CAMPOS = {"nombre": "razon_social"}
    campos_a_sincronizar = {
        MAPEO_CAMPOS.get(k, k): v
        for k, v in campos.items()
        if k
        in ("rfc", "tipo_persona", "nombre", "apellido_paterno", "apellido_materno", "telefono_sms")
        and v
    }
    # "contacto" (tesoreria-service) - en PLD el contacto es siempre el
    # titular mismo, se arma con las mismas piezas de nombre/apellidos que
    # vengan en este PATCH (no jala datos previos del expediente que no se
    # esten tocando ahora, mismo criterio fail-open/parcial del resto de
    # esta funcion).
    nombre_completo = " ".join(
        p for p in (campos.get("nombre"), campos.get("apellido_paterno"), campos.get("apellido_materno")) if p
    )
    if nombre_completo:
        campos_a_sincronizar["contacto"] = nombre_completo
    curp = campos.get("curp")
    if curp and len(curp) >= 11:
        # Posicion 11 (indice 10) de la CURP: unica letra que puede ser
        # H, M o (casos no binarios, INE 2024) X - mismo alfabeto que
        # TesoreriaContraparte.GENERO_CHOICES, ver docstring arriba.
        genero = {"H": "HOMBRE", "M": "MUJER", "X": "X"}.get(curp[10].upper())
        if genero:
            campos_a_sincronizar["genero"] = genero
    if not campos_a_sincronizar:
        return
    try:
        upstream = requests.patch(
            f"{settings.TESORERIA_SERVICE_URL}/api/contrapartes/{id_contraparte}/",
            json=campos_a_sincronizar,
            headers={"X-Internal-Secret": settings.TESORERIA_INTERNAL_SECRET},
            timeout=10,
        )
        if upstream.status_code != 200:
            logger.warning(
                "tesoreria-service rechazo la sincronizacion de %s para %s: %s %s",
                campos_a_sincronizar,
                id_contraparte,
                upstream.status_code,
                upstream.text[:300],
            )
    except requests.RequestException:
        logger.warning(
            "tesoreria-service no respondio al sincronizar %s para %s", campos_a_sincronizar, id_contraparte,
            exc_info=True,
        )


def _obtener_sociedad_en_iam(sociedad_rfc, headers, cookies):
    """Verifica contra el catalogo real (iam-service, general_sociedades)
    que `sociedad_rfc` exista y regresa su nombre (25/Ago/2026, requerimiento
    real del cliente) - mismo criterio fail-open que
    _existe_contraparte_en_tesoreria si iam-service no responde (un
    problema de red entre servicios no debe bloquear el alta de un
    expediente KYC real; se deja pasar sin nombre, no sin sociedad).

    Regresa (existe: bool, nombre: str | None) - "existe" solo es False
    cuando iam-service confirma con un 404 real que esa sociedad no esta en
    su catalogo."""
    try:
        # quote() (02/Sep/2026, hallazgo real: "Hubo un problema en el
        # servidor" PLD-500 al crear un expediente con la sociedad
        # "CONSULTORÍA Y PROYECTOS CUMBRES") - su RFC real es literalmente
        # "#####3" (decision permanente de Fase 1: no hay RFC fiscal real
        # y no lo va a haber, ver iam-service). "#" es el delimitador de
        # fragmento de una URL - sin escaparlo, todo lo que sigue al
        # primer "#" se descartaba ANTES de salir de este proceso (ni
        # siquiera le llegaba a iam-service), asi que la peticion real
        # terminaba siendo GET /api/sociedades/ (la lista completa, no el
        # detalle) - de ahi 'list' object has no attribute 'get' al leer
        # upstream.json().get('razon_social') mas abajo, esperando un dict.
        upstream = requests.get(
            f"{settings.IAM_SERVICE_URL}/api/sociedades/{quote(sociedad_rfc, safe='')}/",
            headers=headers,
            cookies=cookies,
            timeout=10,
        )
    except requests.RequestException:
        logger.warning("iam-service no respondio al validar sociedad_rfc %s", sociedad_rfc, exc_info=True)
        return True, None

    if upstream.status_code == 404:
        return False, None
    if upstream.status_code != 200:
        logger.warning(
            "iam-service respondio %s al validar sociedad_rfc %s", upstream.status_code, sociedad_rfc
        )
        return True, None
    return True, upstream.json().get("razon_social")


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
        # 31/Ago/2026 (pedido de Mariana: "de ahi debe tener filtro para
        # poder ver unicamente los de una sociedad o la otra") - un
        # analista con acceso a varias sociedades (scope union, ver
        # ScopedQuerySet) ve todas mezcladas por default; este filtro deja
        # acotar la vista a una sola sin tener que cambiar el scope real
        # de la sesion. Mismo criterio que ?estado_llenado= arriba.
        sociedad_rfc = self.request.query_params.get("sociedad")
        if sociedad_rfc:
            queryset = queryset.filter(sociedad_rfc=sociedad_rfc)
        proyecto = self.request.query_params.get("proyecto")
        if proyecto:
            queryset = queryset.filter(proyecto=proyecto)
        return queryset

    def create(self, request, *args, **kwargs):
        """Valida contra el catalogo real de tesoreria-service antes de
        crear (24/Ago/2026, ver _resolver_contraparte_en_tesoreria) - el
        unique=True del modelo ya evita duplicados, pero no evita un
        id_contraparte que simplemente no existe en Tesoreria (ej. si
        alguien llama a la API directo, sin pasar por ContraparteSelector).
        02/Sep/2026: si esa contraparte se fusiono con otra (ver
        tesoreria-service::_fusionar_en), se guarda el id vigente que
        tesoreria-service resuelve, no el alias viejo que mando el
        frontend.

        25/Ago/2026 (requerimiento real del cliente: "hay que implementar
        sociedad... se ponga en automatico el nombre") - sociedad_rfc pasa
        de opcional/texto libre a obligatorio, elegido de un dropdown real
        en el frontend contra el catalogo de iam-service (ver
        lib/iam.ts::listSociedades). Se valida aqui igual que
        id_contraparte, y se guarda tambien el nombre (sociedad_nombre,
        snapshot de solo lectura) para poder mostrarselo al cliente en el
        formulario publico sin que esa pagina, sin sesion, tenga que llamar
        a iam-service (que si exige un permiso real)."""
        id_contraparte = request.data.get("id_contraparte")
        headers, cookies = forward_auth_headers(request)
        data = request.data
        if id_contraparte:
            datos_contraparte = _resolver_contraparte_en_tesoreria(id_contraparte, headers, cookies)
            if datos_contraparte is None:
                return Response(
                    {"id_contraparte": "No existe esa contraparte en el catálogo de Tesorería."},
                    status=status.HTTP_400_BAD_REQUEST,
                )
            resuelto = datos_contraparte.get("id_contraparte", id_contraparte)
            if resuelto != id_contraparte:
                data = request.data.copy()
                data["id_contraparte"] = resuelto
            # 02/Sep/2026 (hallazgo real: "al crear el expediente no se
            # llena el nombre" - nombre_completo antes solo lo llenaba el
            # Motor Documental via confirmar_extraccion, nunca al crear el
            # expediente aunque ya se hubiera elegido/creado la contraparte
            # real). Solo se pisa si el cliente no mando ya un
            # nombre_completo explicito propio (no deberia pasar en el
            # flujo normal del selector, pero por si acaso).
            nombre_completo = _nombre_completo_de_contraparte(datos_contraparte)
            if nombre_completo and not request.data.get("nombre_completo"):
                if data is request.data:
                    data = request.data.copy()
                data["nombre_completo"] = nombre_completo
        else:
            # Alta autonoma (Opcion B, 02/Sep/2026): en vez de dejar que el
            # modelo invente un id local sin relacion real con
            # tesoreria-service, se crea la contraparte real alla primero
            # y se usa ese id (ver _crear_contraparte_minima_en_tesoreria).
            # Si tesoreria-service no responde, se sigue fail-open con el
            # default local del modelo - mismo criterio que
            # _resolver_contraparte_en_tesoreria.
            nuevo_id = _crear_contraparte_minima_en_tesoreria()
            if nuevo_id:
                data = request.data.copy()
                data["id_contraparte"] = nuevo_id

        sociedad_rfc = request.data.get("sociedad_rfc")
        if not sociedad_rfc:
            return Response({"sociedad_rfc": "Este campo es requerido."}, status=status.HTTP_400_BAD_REQUEST)
        existe, sociedad_nombre = _obtener_sociedad_en_iam(sociedad_rfc, headers, cookies)
        if not existe:
            return Response(
                {"sociedad_rfc": "No existe esa sociedad en el catálogo."}, status=status.HTTP_400_BAD_REQUEST
            )

        # sociedad_nombre esta en read_only_fields (a proposito, el cliente
        # no lo escribe a mano) - DRF lo descarta si viaja dentro de "data"
        # normal, hay que pisarlo via save(**kwargs) (mismo patron que
        # PldTicketClienteViewSet.actualizar_datos con politicas_aceptadas_en).
        serializer = self.get_serializer(data=data)
        serializer.is_valid(raise_exception=True)
        self.perform_create(serializer)
        serializer.instance.sociedad_nombre = sociedad_nombre
        serializer.instance.save(update_fields=["sociedad_nombre"])
        return Response(serializer.data, status=status.HTTP_201_CREATED)

    def update(self, request, *args, **kwargs):
        """Override del update/partial_update generico de DRF (18/Ago/2026)
        para auditar la edicion manual del analista - hasta ahora era el
        unico camino real de escritura del expediente sin ningun evento en
        la bitacora (confirmar_extraccion y actualizar_datos ya se auditan,
        ver pld/audit_utils.py). Solo audita si algo realmente cambio (un
        PATCH que no modifica nada no genera ruido en la bitacora).

        actor_user_id se resuelve de "updated_by" - mismo campo que el
        cliente ya manda en el body para esta vista (ver
        PldContraparteKycSerializer, escribible a proposito), no un
        actor_user_id aparte."""
        partial = kwargs.pop("partial", False)
        instance = self.get_object()
        serializer = self.get_serializer(instance, data=request.data, partial=partial)
        # Solo campos realmente escribibles del serializer (no "documentos"
        # u otro campo read_only que el cliente pudiera mandar de vuelta sin
        # que tenga efecto real).
        campos_escribibles = {
            nombre for nombre, campo in serializer.fields.items() if not campo.read_only
        }
        def _valor_serializable(valor):
            # None se queda None (no "None" de texto) - las fechas/decimales
            # si necesitan str() para viajar como JSON hacia audit-service.
            return valor if valor is None else str(valor)

        campos_tocados = [campo for campo in request.data if campo in campos_escribibles]
        valores_previos = {campo: _valor_serializable(getattr(instance, campo)) for campo in campos_tocados}

        serializer.is_valid(raise_exception=True)
        self.perform_update(serializer)
        instance.refresh_from_db()

        cambios = {
            campo: _valor_serializable(getattr(instance, campo))
            for campo in campos_tocados
            if _valor_serializable(getattr(instance, campo)) != valores_previos[campo]
        }
        if cambios:
            emitir_evento_auditoria(
                "pld_contrapartes_kyc.editar",
                "pld_contrapartes_kyc",
                str(instance.id_kyc),
                actor_user_id=request.data.get("updated_by"),
                valores_previos={k: v for k, v in valores_previos.items() if k in cambios},
                valores_nuevos={**contexto_kyc(instance), "campos": cambios},
            )
            # 02/Sep/2026, pedido explicito: "si en PLD ya dio RFC y numero
            # se puede colocar ya en tesoreria... igual lo de tipo de
            # persona" - ver _sincronizar_contraparte_en_tesoreria.
            _sincronizar_contraparte_en_tesoreria(instance.id_contraparte, cambios)
        return Response(serializer.data)

    # Campos del expediente que el Motor Documental puede llenar con datos ya
    # validados por el analista (docint/prompts.py: los nombres de
    # extracted_data ya estan alineados a estas columnas a proposito, para
    # que el frontend pueda mandarlos casi tal cual, ver
    # MotorDocumentalDialog.tsx). Whitelist explicita para no permitir que
    # confirmar_extraccion escriba campos fuera de este conjunto (ej.
    # aprobado_por/aprobado_en, que tienen su propio flujo en aprobar()).
    CAMPOS_CONFIRMABLES = {
        "nombre_completo",
        # tipo_persona (02/Sep/2026, pedido explicito: exponerlo tambien en
        # el link publico) - el cliente ahora puede declararlo el mismo
        # via pld-ticket/[token], no solo el analista desde /pld/[idKyc].
        "tipo_persona",
        # nombre/apellido_paterno/apellido_materno (02/Sep/2026, pedido
        # explicito: dividir el nombre en 3 campos para Fisica, tambien
        # expuesto en el link publico) - reemplazan a nombre_completo solo
        # cuando tipo_persona=fisica (logica de visibilidad vive en el
        # frontend, ver lib/pld.ts::esCampoVisibleParaTipoPersona; aqui
        # solo se autoriza que el cliente pueda escribir estas 3 llaves).
        "nombre",
        "apellido_paterno",
        "apellido_materno",
        "fecha_nac_const",
        "pais_nac_const",
        "folio_mercantil",
        "objeto_social",
        "curp",
        "rfc",
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
        """Botón interno "Verificar en Drive" - BORRA los documentos cuyo
        archivo ya no existe en Drive (ver _limpiar_documentos_borrados_en_drive).

        25/Ago/2026 (requerimiento real del cliente: "nadie modifica en
        Drive, todo desde CumbresBI"): ya NO detecta ni da de alta archivos
        subidos directo en drive.google.com - esa deteccion legitimaba
        justo la edicion manual que ahora esta prohibida (revierte la
        decision "Drive-first a proposito" del 18/Ago/2026). El unico
        camino para agregar un documento es el uploader interno
        (PldContraparteDocViewSet.subir), gateado por pld-documentos.crear
        (solo Admin). Este botón se queda como limpieza de seguridad, no
        como flujo de entrada esperado - si un archivo desaparece de Drive
        por fuera del proceso normal, el expediente no debe seguir
        mostrándolo como si siguiera ahí.

        Manual en vez de polling automático - Drive no tiene webhooks
        configurados todavía.

        Regresa el expediente actualizado más "documentos_eliminados", para
        que el frontend pueda avisarle al analista qué desapareció."""
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


class PldRepresentanteLegalViewSet(ModelViewSet):
    """Representante legal / apoderado de una contraparte Moral (02/Sep/2026,
    ver PldRepresentanteLegal en models.py). Mismo permiso que editar datos
    del expediente (pld-compliance.crear/editar) - es informacion de
    identificacion, no un archivo (eso es PldContraparteDoc, con su propio
    permiso pld-documentos.*).

    Filtra por ?kyc=<id_kyc> para listar los representantes de un
    expediente."""

    queryset = PldRepresentanteLegal.objects.all().order_by("-created_at")
    serializer_class = PldRepresentanteLegalSerializer

    def get_permissions(self):
        if self.action == "create":
            return [require_permission("pld-compliance.crear")()]
        if self.action in ("update", "partial_update", "destroy"):
            return [require_permission("pld-compliance.editar")()]
        return super().get_permissions()

    def get_queryset(self):
        queryset = PldRepresentanteLegal.objects.for_scope(self.request.effective_scope).order_by("-created_at")
        kyc_param = self.request.query_params.get("kyc")
        if kyc_param:
            queryset = queryset.filter(kyc_id=kyc_param)
        return queryset

    def perform_create(self, serializer):
        actor = self.request.effective_scope.identity_user_id
        serializer.save(created_by=actor, updated_by=actor)

    def perform_update(self, serializer):
        serializer.save(updated_by=self.request.effective_scope.identity_user_id)


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
        # "pld-documentos" (25/Ago/2026, requerimiento real del cliente:
        # "nadie modifica en Drive, todo desde CumbresBI") - agregar/subir
        # y eliminar un ARCHIVO es exclusivo de Admin, separado a proposito
        # de "pld-compliance.editar" que usa el analista para los datos
        # escritos del expediente. Antes ambas acciones compartian el mismo
        # perm_key (pld-compliance.crear/editar) y el analista podia
        # gestionar archivos igual que datos - ya no.
        if self.action in ("create", "subir"):
            return [require_permission("pld-documentos.crear")()]
        # "destroy" agregado 18/Ago/2026 (hallazgo real: no estaba en esta
        # lista, asi que caia al default global de DRF - AllowAny, sin
        # exigir NINGUN permiso ni sesion. Cualquiera podia borrar
        # documentos del expediente). Mismo criterio letra->accion que el
        # resto (borrar es una forma de "editar" el recurso), pero sobre
        # pld-documentos en vez de pld-compliance desde el 25/Ago/2026 -
        # eliminar un archivo es gestion de archivos, no edicion de datos.
        if self.action == "destroy":
            return [require_permission("pld-documentos.editar")()]
        # "update"/"partial_update" (ej. renombrar denominacion, cambiar
        # status/comentarios) sigue siendo edicion de datos del expediente,
        # no gestion del archivo en si - se queda en pld-compliance.editar,
        # el analista la conserva.
        if self.action in ("update", "partial_update"):
            return [require_permission("pld-compliance.editar")()]
        # "ver" (25/Ago/2026, hallazgo real de Mariana: un analista con
        # permiso real en CumbresBI podia no tener acceso a la Unidad
        # compartida de Google directamente - el link crudo de Drive le
        # daba "No tienes acceso" aunque su rol si lo autorizara aqui).
        # Mismo permiso que leer el expediente - ver un documento ya
        # existente no es mas sensible que verlo listado.
        if self.action == "ver":
            return [require_permission("pld-compliance.leer")()]
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
        # carpeta del cliente directo en la raiz. Subcarpeta por
        # tipo_documento (04/Sep/2026) - ver _carpeta_documento.
        try:
            upstream = requests.post(
                f"{settings.DRIVE_SERVICE_URL}/api/upload/",
                params={"perm": "pld-documentos.crear"},
                files={"file": (archivo.name, archivo.read(), archivo.content_type)},
                data={"carpeta": _carpeta_documento(doc)},
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

    @action(detail=True, methods=["get"])
    @xframe_options_exempt
    def ver(self, request, pk=None):
        """Sirve el archivo real EN STREAMING a traves de pld-service (25/Ago/2026,
        hallazgo real: el boton "Ver" mandaba al link crudo de Google Drive
        - drive.google.com - cuyo acceso lo decide el ACL/grupo de Drive del
        usuario, no el permiso que tiene en CumbresBI. Un analista con
        pld-compliance.leer pero sin membresia real en el grupo de Google
        de la Unidad compartida se topaba con "No tienes acceso" de Google,
        aunque su rol si lo autorizara aqui.

        Reenvia el JWT/cookie del usuario a drive-service (igual que
        subir()) - drive-service valida el mismo perm_key contra el
        EffectiveScope real del usuario antes de descargar via la cuenta de
        servicio (domain-wide delegation), asi el acceso lo sigue
        decidiendo el rol de CumbresBI de punta a punta, nunca la cuenta
        personal de Google de quien mira.

        Content-Disposition inline (no attachment) para que el navegador
        intente mostrarlo (imagen/PDF) en vez de forzar la descarga -
        Content-Type real desde doc.mime_type (el endpoint de Drive
        siempre regresa application/octet-stream, no conoce el tipo real)."""
        doc = self.get_object()
        if not doc.drive_file_id:
            return Response({"detail": "Este documento todavía no tiene un archivo subido."}, status=404)

        # ETag = drive_file_id (01/Sep/2026, hallazgo real: reabrir el mismo
        # documento tardaba lo mismo la segunda vez porque cada apertura
        # repetia los 3 saltos completos - navegador -> pld-service ->
        # drive-service -> Google Drive - sin nada reutilizable de por medio).
        # drive_file_id cambia solo cuando subir() reemplaza el archivo de
        # este mismo doc (mismo id_kyc_doc, misma URL /ver/) - a diferencia
        # de un Cache-Control ciego por tiempo, esto nunca sirve una version
        # vieja despues de un reemplazo, y en un cache-hit ni siquiera se
        # llama a drive-service (el 304 se resuelve aqui mismo).
        # "-v2" (04/Sep/2026, hallazgo real en tesoreria-service con el
        # mismo esquema de ETag): un Content-Type incorrecto cacheado bajo
        # el ETag viejo sobrevive indefinidamente a traves de 304s (que no
        # reenvian headers) - cambiar el ETag una sola vez invalida esa
        # cache vieja en todos los clientes.
        etag = f'"{doc.drive_file_id}-v2"'
        if request.META.get("HTTP_IF_NONE_MATCH") == etag:
            # HttpResponse plano, no Response de DRF - un 304 no debe llevar
            # body, y el renderer de DRF le agregaria Content-Type de mas.
            response = HttpResponse(status=304)
            response["ETag"] = etag
            response["Cache-Control"] = "private, max-age=300"
            return response

        headers, cookies = forward_auth_headers(request)
        try:
            upstream = requests.get(
                f"{settings.DRIVE_SERVICE_URL}/api/download/{doc.drive_file_id}/",
                params={"perm": "pld-compliance.leer", "carpeta": _carpeta_documento(doc)},
                headers=headers,
                cookies=cookies,
                stream=True,
                timeout=30,
            )
        except requests.RequestException:
            logger.warning("drive-service no respondio al servir el documento %s", doc.id_kyc_doc, exc_info=True)
            return Response({"detail": "El servicio de Drive no respondió. Intenta de nuevo."}, status=502)

        if upstream.status_code != 200:
            detalle = upstream.json() if upstream.content else {"detail": "Error al obtener el archivo de Drive"}
            return Response(detalle, status=upstream.status_code if upstream.status_code in (403, 404) else 502)

        # 04/Sep/2026 (hallazgo real en tesoreria-service con el mismo
        # patron: un documento con mime_type sin capturar bien forzaba
        # descarga en vez de previsualizar) - drive-service ya consulta el
        # tipo real en Drive (ver DownloadView), asi que su Content-Type
        # manda; doc.mime_type queda solo como respaldo si esa consulta falla.
        content_type = upstream.headers.get("Content-Type") or doc.mime_type or "application/octet-stream"
        response = StreamingHttpResponse(upstream.iter_content(chunk_size=8192), content_type=content_type)
        response["Content-Disposition"] = f'inline; filename="{doc.denominacion or doc.id_kyc_doc}"'
        # ETag + Cache-Control - ver comentario arriba, junto al chequeo de
        # If-None-Match. "private" porque pasa por autenticacion real (no
        # es cacheable por un proxy/CDN compartido).
        response["ETag"] = etag
        response["Cache-Control"] = "private, max-age=300"
        # Permite embeber esto en un <iframe> del frontend (01/Sep/2026,
        # pedido explicito de Mariana: "ver documento" en PLD debe mostrarse
        # como panel/preview en la misma pantalla, igual que en Facturas -
        # Motor Documental - en vez de abrir Drive en pestaña nueva).
        # X-Frame-Options: DENY es el default de Django (XFrameOptionsMiddleware,
        # ver settings.py) y bloquearia CUALQUIER framing, incluso del propio
        # frontend; @xframe_options_exempt lo quita para esta vista puntual y
        # este header CSP toma su lugar, restringido a los mismos origenes ya
        # confiables de CORS_ALLOWED_ORIGINS (no "cualquier sitio puede
        # embeber esto", que si seria un riesgo real de clickjacking sobre
        # documentos de identidad).
        origenes = " ".join(settings.CORS_ALLOWED_ORIGINS)
        response["Content-Security-Policy"] = f"frame-ancestors 'self' {origenes}"
        return response

    def destroy(self, request, *args, **kwargs):
        """Override del destroy generico de DRF (18/Ago/2026) - eliminar un
        documento del expediente (ej. un duplicado, ver comentario en
        get_permissions arriba) es una decision sobre evidencia KYC de un
        cliente real y debe quedar auditada igual que subir/aprobar, no solo
        gateada por permiso."""
        doc = self.get_object()
        response = super().destroy(request, *args, **kwargs)
        _emitir_evento_eliminar_documento(doc, actor_user_id=request.data.get("actor_user_id"))
        return response


def _emitir_evento_eliminar_documento(doc, actor_user_id, accion="pld_contrapartes_docs.eliminar"):
    """Compartido entre PldContraparteDocViewSet.destroy (borrado directo,
    Admin) y PldSolicitudEliminacionDocViewSet.aprobar (borrado via
    solicitud aprobada) - misma auditoria en ambos casos, solo cambia la
    accion registrada para poder distinguirlas despues en la bitacora."""
    emitir_evento_auditoria(
        accion,
        "pld_contrapartes_docs",
        str(doc.id_kyc_doc),
        actor_user_id=actor_user_id,
        valores_previos={**contexto_kyc(doc.kyc), "denominacion": doc.denominacion, "drive_file_id": doc.drive_file_id},
    )


class PldSolicitudEliminacionDocViewSet(ModelViewSet):
    """Solicitud de eliminacion de un documento (25/Ago/2026, requerimiento
    real del cliente) - el analista (pld-compliance.editar) ya no puede
    borrar un archivo directo (ver pld-documentos, exclusivo Admin), asi
    que pide su eliminacion con una razon breve; Admin (pld-documentos.editar)
    la aprueba (borra el documento de verdad) o la rechaza (se queda como
    esta, con el motivo)."""

    queryset = PldSolicitudEliminacionDoc.objects.all().order_by("-solicitado_en")
    serializer_class = PldSolicitudEliminacionDocSerializer

    def get_permissions(self):
        if self.action == "create":
            return [require_permission("pld-compliance.editar")()]
        if self.action in ("aprobar", "rechazar"):
            return [require_permission("pld-documentos.editar")()]
        return super().get_permissions()

    def get_queryset(self):
        queryset = PldSolicitudEliminacionDoc.objects.for_scope(self.request.effective_scope).order_by(
            "-solicitado_en"
        )
        estado = self.request.query_params.get("estado")
        if estado:
            queryset = queryset.filter(estado=estado.upper())
        return queryset

    def perform_create(self, serializer):
        # denominacion_doc/sociedad_rfc (25/Ago/2026) - snapshot al momento
        # de crear, el cliente no los manda (se derivan del documento real,
        # ver comentario en models.py sobre por que no es un join en vivo).
        documento = serializer.validated_data["documento"]
        solicitud = serializer.save(
            denominacion_doc=documento.denominacion,
            sociedad_rfc=documento.kyc.sociedad_rfc,
            proyecto=documento.kyc.proyecto,
        )
        emitir_evento_auditoria(
            "pld_solicitudes_eliminacion_doc.solicitar",
            "pld_solicitudes_eliminacion_doc",
            str(solicitud.id_solicitud),
            actor_user_id=solicitud.solicitado_por,
            valores_nuevos={
                **contexto_kyc(solicitud.documento.kyc),
                "denominacion": solicitud.documento.denominacion,
                "razon": solicitud.razon,
            },
        )

    @action(detail=True, methods=["post"])
    def aprobar(self, request, pk=None):
        """Aprueba la solicitud y borra el documento de verdad - mismo
        criterio de auditoria que el destroy() directo
        (PldContraparteDocViewSet), solo que la accion queda distinguida
        como "eliminar_por_solicitud" para poder rastrear en la bitacora
        que paso por este flujo y no un borrado directo de Admin."""
        solicitud = self.get_object()
        if solicitud.estado != PldSolicitudEliminacionDoc.ESTADO_PENDIENTE:
            return Response({"detail": "Esta solicitud ya fue resuelta."}, status=400)

        doc = solicitud.documento
        actor_user_id = request.data.get("actor_user_id")
        _emitir_evento_eliminar_documento(doc, actor_user_id, accion="pld_contrapartes_docs.eliminar_por_solicitud")
        doc.delete()
        # doc.delete() deja doc.pk en None (comportamiento normal de
        # Django) - solicitud.documento en memoria sigue apuntando a ese
        # mismo objeto ahora invalido. La FK real ya quedo en NULL en la
        # base (on_delete=SET_NULL), asi que se limpia tambien aqui antes
        # de guardar; sin esto, save() truena con "unsaved related object".
        solicitud.documento = None

        solicitud.estado = PldSolicitudEliminacionDoc.ESTADO_APROBADA
        solicitud.resuelto_por = actor_user_id
        solicitud.resuelto_en = timezone.now()
        solicitud.comentario_resolucion = request.data.get("comentario_resolucion")
        solicitud.save(
            update_fields=["documento", "estado", "resuelto_por", "resuelto_en", "comentario_resolucion"]
        )
        return Response(self.get_serializer(solicitud).data)

    @action(detail=True, methods=["post"])
    def rechazar(self, request, pk=None):
        """Rechaza la solicitud sin tocar el documento - se queda tal cual
        estaba, solo con el motivo de rechazo para que el analista lo vea."""
        solicitud = self.get_object()
        if solicitud.estado != PldSolicitudEliminacionDoc.ESTADO_PENDIENTE:
            return Response({"detail": "Esta solicitud ya fue resuelta."}, status=400)

        actor_user_id = request.data.get("actor_user_id")
        solicitud.estado = PldSolicitudEliminacionDoc.ESTADO_RECHAZADA
        solicitud.resuelto_por = actor_user_id
        solicitud.resuelto_en = timezone.now()
        solicitud.comentario_resolucion = request.data.get("comentario_resolucion")
        solicitud.save(update_fields=["estado", "resuelto_por", "resuelto_en", "comentario_resolucion"])
        emitir_evento_auditoria(
            "pld_solicitudes_eliminacion_doc.rechazar",
            "pld_solicitudes_eliminacion_doc",
            str(solicitud.id_solicitud),
            actor_user_id=actor_user_id,
            valores_nuevos={
                **contexto_kyc(solicitud.documento.kyc),
                "denominacion": solicitud.documento.denominacion,
                "comentario_resolucion": solicitud.comentario_resolucion,
            },
        )
        return Response(self.get_serializer(solicitud).data)


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
        # 31/Ago/2026 (auditoria de scope): antes `.all()` sin RLS pese a
        # que el modelo ya tenia ScopedManager - cualquiera con permiso
        # interno veia los tickets de todos los expedientes. "validar"/
        # "subir_documento"/"actualizar_datos" (publicos) NO pasan por
        # aqui - resuelven el ticket directo por token (ver mas abajo).
        queryset = PldTicketCliente.objects.for_scope(self.request.effective_scope).select_related(
            "kyc"
        ).order_by("-issued_at")
        kyc_param = self.request.query_params.get("kyc")
        if kyc_param:
            queryset = queryset.filter(kyc_id=kyc_param)
        # 31/Ago/2026 (pedido de Mariana: "igual en tickets debe tener
        # filtro") - mismo criterio que PldContraparteKycViewSet.get_queryset:
        # acota la vista sin cambiar el scope real de la sesion.
        sociedad_rfc = self.request.query_params.get("sociedad")
        if sociedad_rfc:
            queryset = queryset.filter(kyc__sociedad_rfc=sociedad_rfc)
        proyecto = self.request.query_params.get("proyecto")
        if proyecto:
            queryset = queryset.filter(kyc__proyecto=proyecto)
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

        # Sin tipo_documento a proposito (el cliente nunca elige uno) - cae
        # en "Generales", mismo criterio que _carpeta_documento cuando
        # tipo_documento es NULL.
        carpeta = f"PLD/Nuevos Clientes/{ticket.kyc.id_contraparte}/Generales"
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

        # Consentimiento (25/Ago/2026, requerimiento real del cliente): el
        # formulario publico exige aceptar el aviso de privacidad y
        # declarar bajo protesta de decir verdad antes de poder guardar -
        # se valida tambien aqui, no solo en el frontend (el frontend ya
        # bloquea el boton, pero un llamado directo a la API podria saltarse
        # ese gate). No son parte de CAMPOS_CONFIRMABLES - son metadata del
        # consentimiento, no datos de negocio del cliente.
        if not request.data.get("acepta_politicas") or not request.data.get("declara_veracidad"):
            return Response(
                {"detail": "Debes aceptar el aviso de privacidad y declarar bajo protesta de decir verdad."},
                status=400,
            )

        datos_validos = {
            k: v for k, v in campos.items() if k in PldContraparteKycViewSet.CAMPOS_CONFIRMABLES
        }
        if not datos_validos:
            return Response(
                {"detail": "Ninguno de los campos enviados es editable por el cliente."}, status=400
            )

        ahora = timezone.now()
        ip_cliente = request.META.get("REMOTE_ADDR")
        serializer = PldContraparteKycSerializer(ticket.kyc, data=datos_validos, partial=True)
        serializer.is_valid(raise_exception=True)
        serializer.save(
            updated_by="externo",
            politicas_aceptadas_en=ahora,
            veracidad_declarada_en=ahora,
            consentimiento_ip=ip_cliente,
        )
        emitir_evento_auditoria(
            "pld_contrapartes_kyc.actualizar_datos",
            "pld_contrapartes_kyc",
            str(ticket.kyc_id),
            actor_user_id="externo",
            valores_nuevos={
                **contexto_kyc(ticket.kyc),
                "campos": datos_validos,
                "consentimiento_en": ahora.isoformat(),
                "consentimiento_ip": ip_cliente,
            },
        )
        # 02/Sep/2026, pedido explicito: "si en PLD ya dio RFC y numero se
        # puede colocar ya en tesoreria... igual lo de tipo de persona" -
        # el cliente puede ser quien complete estos datos via el link
        # publico, no solo el analista (ver update() arriba, mismo
        # criterio). ticket.kyc ya trae el rfc/tipo_persona actualizados
        # (serializer.save() los aplico sobre la misma instancia).
        _sincronizar_contraparte_en_tesoreria(ticket.kyc.id_contraparte, datos_validos)
        return Response(serializer.data)

    @action(detail=True, methods=["post"])
    def revocar(self, request, pk=None):
        ticket = self.get_object()
        if ticket.revoked_at is None:
            ticket.revoked_at = timezone.now()
            ticket.save(update_fields=["revoked_at"])
        return Response(self.get_serializer(ticket).data)
