import csv

from django.http import HttpResponse
from django.utils import timezone
from rest_framework.decorators import action
from rest_framework.filters import SearchFilter
from rest_framework.response import Response
from rest_framework.viewsets import ReadOnlyModelViewSet

from .models import BitacoraAuditoria
from .serializers import BitacoraAuditoriaSerializer


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
        response = HttpResponse(content_type="text/csv")
        response["Content-Disposition"] = 'attachment; filename="bitacora_auditoria.csv"'
        writer = csv.writer(response)
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
        return response

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
