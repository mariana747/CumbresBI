import csv

from django.http import HttpResponse
from rest_framework.decorators import action
from rest_framework.filters import SearchFilter
from rest_framework.viewsets import ReadOnlyModelViewSet

from .models import BitacoraAuditoria
from .serializers import BitacoraAuditoriaSerializer


class BitacoraAuditoriaViewSet(ReadOnlyModelViewSet):
    """Visor de bitacora de auditoria (Fase 1, Semana 6). Solo lectura -
    bitacora_auditoria es append-only, ver models.py; el escritor previsto es
    Pub/Sub (Fase 1+ real, todavia sin GCP), NO un endpoint generico de
    creacion.

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
