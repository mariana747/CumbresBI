from django.utils import timezone
from rest_framework.decorators import action
from rest_framework.response import Response
from rest_framework.viewsets import GenericViewSet

from .models import BitacoraAuditoria
from .serializers import BitacoraAuditoriaSerializer


class BitacoraAuditoriaViewSet(GenericViewSet):
    """Escritor puntual de bitacora_auditoria (append-only, ver models.py).
    El escritor previsto es Pub/Sub (Fase 1+ real, todavia sin GCP); la
    unica excepcion es confirmar_envio_drive abajo: un evento puntual,
    documentado, mientras no exista esa integracion real.
    """

    queryset = BitacoraAuditoria.objects.all()
    serializer_class = BitacoraAuditoriaSerializer

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
