import csv
import io
import logging

import requests
from django.conf import settings
from django.utils import timezone
from rest_framework.decorators import action
from rest_framework.filters import SearchFilter
from rest_framework.response import Response
from rest_framework.viewsets import ReadOnlyModelViewSet

from .models import BitacoraAuditoria
from .serializers import BitacoraAuditoriaSerializer

logger = logging.getLogger(__name__)


class BitacoraAuditoriaViewSet(ReadOnlyModelViewSet):
    """Visor de bitacora de auditoria (Fase 1, Semana 6). Solo lectura -
    bitacora_auditoria es append-only, ver models.py; el escritor previsto es
    Pub/Sub (Fase 1+ real, todavia sin GCP), NO un endpoint generico de
    creacion. La unica excepcion es confirmar_envio_drive abajo: un evento
    puntual, documentado, mientras no exista esa integracion real.

    Filtros: ?servicio_origen=, ?actor_user_id=, ?entidad=, ?desde=
    (ocurrido_en >=, ISO 8601), ?hasta= (ocurrido_en <=, ISO 8601).
    Busqueda de texto libre (?search=) sobre accion/entidad/entidad_id.
    Exportable a CSV via /api/bitacora/export_csv/ (mismos filtros que la
    lista) - exportacion a PDF sigue pendiente.
    """

    queryset = BitacoraAuditoria.objects.all()
    serializer_class = BitacoraAuditoriaSerializer
    filter_backends = [SearchFilter]
    search_fields = ["accion", "entidad", "entidad_id"]

    def get_queryset(self):
        queryset = super().get_queryset()
        # Gate por rol, no por fila: la bitacora no tiene columna de
        # sociedad/proyecto (es un log cross-empresa por diseño), asi que
        # ScopedManager no aplica aqui. Solo GLOBAL o rol AUDITOR la ven -
        # decision de producto 2026-08-10, ver memoria de sesion
        # "empresas-alcance-fase1"/plan Fase 1 punto 1.
        scope = self.request.effective_scope
        if not (scope is not None and (scope.is_global or scope.has_role("AUDITOR"))):
            return queryset.none()
        servicio_origen = self.request.query_params.get("servicio_origen")
        if servicio_origen:
            queryset = queryset.filter(servicio_origen=servicio_origen)
        actor_user_id = self.request.query_params.get("actor_user_id")
        if actor_user_id:
            queryset = queryset.filter(actor_user_id=actor_user_id)
        entidad = self.request.query_params.get("entidad")
        if entidad:
            queryset = queryset.filter(entidad=entidad)
        desde = self.request.query_params.get("desde")
        if desde:
            queryset = queryset.filter(ocurrido_en__gte=desde)
        hasta = self.request.query_params.get("hasta")
        if hasta:
            queryset = queryset.filter(ocurrido_en__lte=hasta)
        return queryset

    @action(detail=False, methods=["get"])
    def export_csv(self, request):
        """Ya NO descarga el CSV directo al navegador (decision de Mariana,
        12/Ago/2026, ver memoria de sesion "csv-auditoria-a-drive"): arma el
        CSV en memoria y lo sube a Drive via drive-service
        (CumbresBI/Auditoria/Bitacora/), igual que pld-service sube
        documentos KYC. Regresa el file_id/web_view_link de Drive en vez de
        streamear el archivo - el frontend ya no ofrece descarga local.

        Reenvia el JWT del usuario original a drive-service (mismo patron
        que PldContraparteDocViewSet.subir) - el permiso real de subida lo
        decide drive-service via ?perm=audit.leer (el mismo perm_key que ya
        exige get_queryset arriba para poder ver la bitacora)."""
        buffer = io.StringIO()
        writer = csv.writer(buffer)
        writer.writerow(
            [
                "event_id",
                "servicio_origen",
                "actor_user_id",
                "accion",
                "entidad",
                "entidad_id",
                "ocurrido_en",
                "recibido_en",
            ]
        )
        for evento in self.filter_queryset(self.get_queryset()):
            writer.writerow(
                [
                    evento.event_id,
                    evento.servicio_origen,
                    evento.actor_user_id,
                    evento.accion,
                    evento.entidad,
                    evento.entidad_id,
                    evento.ocurrido_en,
                    evento.recibido_en,
                ]
            )
        contenido = buffer.getvalue().encode("utf-8")

        headers = {}
        auth_header = request.META.get("HTTP_AUTHORIZATION")
        if auth_header:
            headers["Authorization"] = auth_header
        cookie_name = getattr(settings, "CUMBRESBI_SCOPE_SESSION_COOKIE_NAME", "cumbresbi_session")
        cookies = {}
        if request.COOKIES.get(cookie_name):
            cookies[cookie_name] = request.COOKIES[cookie_name]

        nombre_archivo = f"bitacora_auditoria_{timezone.now().strftime('%Y%m%d%H%M%S')}.csv"
        try:
            upstream = requests.post(
                f"{settings.DRIVE_SERVICE_URL}/api/upload/",
                params={"perm": "audit.leer"},
                files={"file": (nombre_archivo, contenido, "text/csv")},
                data={"carpeta": "Auditoria/Bitacora"},
                headers=headers,
                cookies=cookies,
                timeout=30,
            )
        except requests.RequestException:
            logger.warning("drive-service no respondio al exportar la bitacora a CSV", exc_info=True)
            return Response({"detail": "El servicio de Drive no respondió. Intenta de nuevo."}, status=502)

        if upstream.status_code != 201:
            return Response(
                upstream.json() if upstream.content else {"detail": "Error al subir el CSV a Drive"},
                status=upstream.status_code,
            )

        return Response(upstream.json(), status=201)

    @action(detail=False, methods=["post"])
    def registrar_evento(self, request):
        """Registro directo de un evento de auditoria (llamada sincrona
        service-to-service), mismo criterio interino que
        confirmar_envio_drive: mientras no exista Pub/Sub real
        (docs/architecture/README.md sec. 9), los servicios consumidores
        POSTean aqui en vez de publicar al outbox. Reemplazar por el
        consumidor real de `audit.events` cuando exista GCP/Pub-Sub.

        Requiere servicio_origen, accion, entidad, entidad_id. actor_user_id
        y valores_previos/valores_nuevos son opcionales (actor_user_id
        default "sin-auth" para acciones sin usuario interno identificable,
        ej. un usuario externo via Magic Link).
        """
        required = ["servicio_origen", "accion", "entidad", "entidad_id"]
        faltantes = [campo for campo in required if not request.data.get(campo)]
        if faltantes:
            return Response({campo: ["Este campo es requerido."] for campo in faltantes}, status=400)

        evento = BitacoraAuditoria.objects.create(
            servicio_origen=request.data["servicio_origen"],
            actor_user_id=request.data.get("actor_user_id") or "sin-auth",
            accion=request.data["accion"],
            entidad=request.data["entidad"],
            entidad_id=request.data["entidad_id"],
            valores_previos=request.data.get("valores_previos"),
            valores_nuevos=request.data.get("valores_nuevos"),
            ocurrido_en=request.data.get("ocurrido_en") or timezone.now(),
        )
        return Response(BitacoraAuditoriaSerializer(evento).data, status=201)

    @action(detail=False, methods=["post"])
    def confirmar_envio_drive(self, request):
        """Boton de confirmacion de envio a Drive (Motor Documental, Fase 0
        sec. 10 - streaming via Drive API todavia bloqueado por falta del
        proyecto GCP). NO sube nada real a Drive: solo deja constancia de
        que el usuario confirmo la intencion, con formato (PDF) y la fecha/
        hora en que se consulto el documento. Reemplazar por el evento real
        (via Pub/Sub, disparado cuando drive.py deje de lanzar
        NotImplementedError) cuando exista esa integracion.
        """
        entidad_id = request.data.get("entidad_id")
        if not entidad_id:
            return Response({"entidad_id": ["Este campo es requerido."]}, status=400)

        evento = BitacoraAuditoria.objects.create(
            servicio_origen=request.data.get("servicio_origen", "document-intelligence-service"),
            actor_user_id=request.data.get("actor_user_id") or "sin-auth",
            accion="documento.confirmar_envio_drive",
            entidad=request.data.get("entidad", "documento_analizado"),
            entidad_id=entidad_id,
            valores_nuevos={
                "formato": "pdf",
                "consultado_en": request.data.get("consultado_en") or timezone.now().isoformat(),
                "estado": "confirmado_pendiente_conexion_real",
            },
            ocurrido_en=timezone.now(),
        )
        return Response(BitacoraAuditoriaSerializer(evento).data, status=201)
