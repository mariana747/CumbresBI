from cumbresbi_scope.permissions import require_permission
from django.utils import timezone
from rest_framework.decorators import action
from rest_framework.filters import SearchFilter
from rest_framework.response import Response
from rest_framework.viewsets import ModelViewSet

from .models import PldContraparteDoc, PldContraparteKyc, PldTicketCliente
from .serializers import (
    PldContraparteDocSerializer,
    PldContraparteKycSerializer,
    PldTicketClienteSerializer,
)
from .ticket_utils import generate_token, hash_token


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
        if self.action in ("update", "partial_update"):
            return [require_permission("pld-compliance.editar")()]
        if self.action == "aprobar":
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
        return Response(self.get_serializer(kyc).data)


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
        if self.action == "create":
            return [require_permission("pld-compliance.crear")()]
        if self.action in ("update", "partial_update"):
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
        # "validar" es publico (el cliente externo canjea su ticket sin
        # sesion, ver iam-magic-link-alcance) - crear/revocar el ticket es
        # accion interna de PLD.
        if self.action == "validar":
            return []
        if self.action == "create":
            return [require_permission("pld-compliance.crear")()]
        if self.action == "revocar":
            return [require_permission("pld-compliance.editar")()]
        return super().get_permissions()

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
        return response

    @action(detail=False, methods=["post"])
    def validar(self, request):
        """Valida un token en claro (recibido en el link) y, si es válido,
        marca su uso. Regresa el ticket junto con el expediente KYC asociado
        (si tiene uno) para que el formulario público sepa sobre qué
        expediente está trabajando."""
        token = request.data.get("token")
        if not token:
            return Response({"token": ["Este campo es requerido."]}, status=400)

        try:
            ticket = PldTicketCliente.objects.get(token_hash=hash_token(token))
        except PldTicketCliente.DoesNotExist:
            return Response({"detail": "Token inválido."}, status=404)

        now = timezone.now()
        if ticket.revoked_at is not None:
            return Response({"detail": "Este link fue revocado."}, status=403)
        if ticket.expires_at < now:
            return Response({"detail": "Este link expiró."}, status=403)
        if ticket.uses_count >= ticket.max_uses:
            return Response({"detail": "Este link ya alcanzó su límite de usos."}, status=403)

        ticket.uses_count += 1
        ticket.last_used_at = now
        if ticket.first_used_at is None:
            ticket.first_used_at = now
        ticket.save(update_fields=["uses_count", "last_used_at", "first_used_at"])

        data = self.get_serializer(ticket).data
        if ticket.kyc_id:
            data["kyc"] = PldContraparteKycSerializer(ticket.kyc).data
        return Response(data)

    @action(detail=True, methods=["post"])
    def revocar(self, request, pk=None):
        ticket = self.get_object()
        if ticket.revoked_at is None:
            ticket.revoked_at = timezone.now()
            ticket.save(update_fields=["revoked_at"])
        return Response(self.get_serializer(ticket).data)
