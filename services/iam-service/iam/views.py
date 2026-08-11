import re
from datetime import timedelta

from cumbresbi_scope.permissions import require_permission
from django.db.models import Count, Q
from django.utils import timezone
from rest_framework.decorators import action
from rest_framework.filters import SearchFilter
from rest_framework.response import Response
from rest_framework.viewsets import ModelViewSet, ReadOnlyModelViewSet

from .audit_utils import emitir_evento_auditoria
from .magic_link_utils import generate_token, hash_token, issue_external_jwt
from .models import (
    GeneralSociedad,
    IamGroup,
    IamInvitation,
    IamMagicLink,
    IamPermission,
    IamRole,
    IamRolePermission,
    IamUser,
    IamUserCentroAccess,
    IamUserContratoAccess,
    IamUserGroup,
    IamUserRole,
)
from .serializers import (
    GeneralSociedadSerializer,
    IamGroupSerializer,
    IamInvitationSerializer,
    IamMagicLinkSerializer,
    IamPermissionSerializer,
    IamRoleSerializer,
    IamUserCentroAccessSerializer,
    IamUserContratoAccessSerializer,
    IamUserGroupSerializer,
    IamUserRoleSerializer,
    IamUserSerializer,
)

# Cambio de decision del cliente (Dylan, 2026-08-07): el Magic Link ya no
# vive 7 dias, vive 30 minutos - ventana corta a proposito, no es un
# ajuste tecnico interno. Actualizar README.md sec. 6.2/sec. 4 y el Plan de
# Trabajo si se documenta la fecha exacta de este cambio de alcance.
MAGIC_LINK_DEFAULT_EXPIRATION_MINUTES = 30

# Validacion simple de formato (no de existencia real del correo, eso solo
# lo confirma que la persona de verdad abra el link) - misma tolerancia que
# el campo EmailField del serializer, solo que aqui se necesita validar uno
# por uno antes de crear, para poder reportar cual fila del CSV fallo.
EMAIL_RE = re.compile(r"^[^@\s]+@[^@\s]+\.[^@\s]+$")


class IamUserViewSet(ReadOnlyModelViewSet):
    """Solo lectura por ahora - la aplicacion del alcance (cumbresbi_scope)
    y los permisos de escritura llegan en Fase 1, junto con la emision real
    de JWT por iam-service. Esto es la primera API real del sistema, para
    validar Cloud Run + Cloud SQL de punta a punta (Fase 0, Actividad 1).

    Directorio de usuarios (Fase 1): busqueda por correo/nombre via
    ?search=, filtro por estado via ?status=ACTIVE|SUSPENDED|DELETED, filtro
    por rol activo via ?role=<role_key> (ver iam_user_roles, revoked_at IS
    NULL) y filtro por empresa via ?group=<group_id> (IamGroup - membresia
    activa, removed_at IS NULL). Desactivar/reactivar (escritura) sigue
    pendiente - depende de permisos reales, no solo de exponer el campo.

    ?sin_rol=true (decision de producto: acceso de empleados nuevos via
    login libre, no invitacion formal - ver memoria de sesion
    "iam-invitacion-alcance-incierto"): usuarios sin ningun rol activo, para
    la lista/aviso de "falta asignar rol" en el frontend.
    """

    queryset = IamUser.objects.all().order_by("primary_email")
    serializer_class = IamUserSerializer
    filter_backends = [SearchFilter]
    search_fields = ["primary_email", "display_name"]

    def get_queryset(self):
        # IamUser es dato operativo por usuario (no un catalogo), por eso si
        # lleva ScopedManager - a diferencia de IamRole/IamPermission/
        # IamGroup (catalogos compartidos, decision 2026-08-10, sin filtro).
        # IamUser todavia no declara SCOPE_FIELD_* (gap documentado en
        # roles-y-permisos.md) asi que hoy esto es el gate GLOBAL/no-GLOBAL:
        # solo GLOBAL ve el directorio, el resto no ve nada hasta el punto 2
        # del plan (columnas reales de sociedad/proyecto).
        queryset = IamUser.objects.for_scope(self.request.effective_scope).order_by("primary_email")
        status_param = self.request.query_params.get("status")
        if status_param:
            queryset = queryset.filter(status=status_param.upper())
        role_param = self.request.query_params.get("role")
        if role_param:
            queryset = queryset.filter(
                user_roles__role__role_key=role_param, user_roles__revoked_at__isnull=True
            ).distinct()
        group_param = self.request.query_params.get("group")
        if group_param:
            queryset = queryset.filter(
                user_groups__group_id=group_param, user_groups__removed_at__isnull=True
            ).distinct()
        if self.request.query_params.get("sin_rol") == "true":
            # exclude(user_roles__revoked_at__isnull=True) NO sirve aqui: el
            # LEFT OUTER JOIN implicito genera una fila con revoked_at=NULL
            # para un usuario SIN ningun rol (por ausencia, no por dato
            # real), y eso hace match falso con "IS NULL" - excluiria
            # tambien a quien deberia aparecer. annotate(Count(...)) cuenta
            # filas reales, sin ese falso positivo.
            queryset = queryset.annotate(
                roles_activos=Count("user_roles", filter=Q(user_roles__revoked_at__isnull=True))
            ).filter(roles_activos=0)
        return queryset


class IamRoleViewSet(ModelViewSet):
    """Catalogo de roles para el filtro del directorio de usuarios y, via el
    campo "permisos" del serializer, la matriz de permisos roles x permisos
    (Fase 1, Semana 5). El rol en si sigue siendo de solo lectura (crear/
    editar/borrar un rol sigue pendiente) - lo unico editable son sus
    permisos, via las dos acciones de abajo (matriz de permisos editable).
    """

    http_method_names = ["get", "post", "head", "options"]
    queryset = IamRole.objects.all().order_by("role_name")
    serializer_class = IamRoleSerializer

    def get_permissions(self):
        # Editar la matriz de permisos (otorgar/revocar) requiere
        # "iam.editar" - el rol en si sigue siendo de solo lectura (sin
        # accion de create/update expuesta), asi que solo estas dos
        # acciones necesitan el gate.
        if self.action in ("otorgar_permiso", "revocar_permiso"):
            return [require_permission("iam.editar")()]
        return super().get_permissions()

    @action(detail=True, methods=["post"])
    def otorgar_permiso(self, request, pk=None):
        role = self.get_object()
        permission_id = request.data.get("permission")
        actor_user_id = request.data.get("actor_user_id")
        errors = {}
        if not permission_id:
            errors["permission"] = ["Este campo es requerido."]
        if not actor_user_id:
            errors["actor_user_id"] = ["Este campo es requerido."]
        if errors:
            return Response(errors, status=400)

        try:
            permission = IamPermission.objects.get(pk=permission_id)
        except IamPermission.DoesNotExist:
            return Response({"permission": ["No existe ese permiso."]}, status=404)

        _, created = IamRolePermission.objects.get_or_create(
            role=role,
            permission=permission,
            defaults={"created_by_id": actor_user_id, "updated_by_id": actor_user_id},
        )
        if created:
            emitir_evento_auditoria(
                "iam_role_permissions.grant",
                "iam_role_permissions",
                f"{role.role_id}:{permission.permission_id}",
                actor_user_id=actor_user_id,
                valores_nuevos={"role": role.role_key, "permission": permission.perm_key},
            )
        return Response(self.get_serializer(role).data, status=201 if created else 200)

    @action(detail=True, methods=["post"])
    def revocar_permiso(self, request, pk=None):
        role = self.get_object()
        permission_id = request.data.get("permission")
        actor_user_id = request.data.get("actor_user_id")
        if not permission_id:
            return Response({"permission": ["Este campo es requerido."]}, status=400)

        deleted_count, _ = IamRolePermission.objects.filter(
            role=role, permission_id=permission_id
        ).delete()
        if deleted_count:
            emitir_evento_auditoria(
                "iam_role_permissions.revoke",
                "iam_role_permissions",
                f"{role.role_id}:{permission_id}",
                actor_user_id=actor_user_id,
                valores_nuevos={"role": role.role_key, "permission_id": permission_id},
            )
        return Response(self.get_serializer(role).data)


class IamPermissionViewSet(ReadOnlyModelViewSet):
    """Solo lectura - catalogo completo de permisos (Fase 1, Semana 5), para
    que el frontend arme las columnas de la matriz de permisos combinando
    esto con el campo "permisos" de cada IamRole."""

    queryset = IamPermission.objects.all().order_by("perm_key")
    serializer_class = IamPermissionSerializer


class IamGroupViewSet(ReadOnlyModelViewSet):
    """Solo lectura - catalogo de "empresas" (IamGroup, equipos internos que
    en la practica se nombran como la empresa/sociedad del colaborador, ej.
    'CUMBRES', 'TIZARA CAPITAL') para poblar el filtro de empresa del
    directorio de usuarios."""

    queryset = IamGroup.objects.all().order_by("nombre")
    serializer_class = IamGroupSerializer


class IamUserRoleViewSet(ModelViewSet):
    """Otorgar y revocar roles (Fase 1, Semana 5: "logica de asignacion de
    roles con alcance"). Filtra por ?user=<user_id> para listar las
    asignaciones de un usuario especifico.

    DELETE no esta permitido a proposito: una asignacion nunca se borra, se
    revoca (revoked_at) para conservar el historial - usa
    POST /api/user-roles/{id}/revoke/.

    Reporte de historial de cambios de permisos (Fase 1, Semana 6): esta
    misma lista, sin el filtro ?user=, ya es el historial completo
    (otorgamientos y revocaciones, mas recientes primero) - no hace falta
    un endpoint de reporte aparte.
    """

    http_method_names = ["get", "post", "head", "options"]
    queryset = IamUserRole.objects.select_related("role", "user").order_by("-granted_at")
    serializer_class = IamUserRoleSerializer

    def get_permissions(self):
        # Otorgar un rol nuevo = "iam.crear"; revocar uno existente =
        # "iam.editar" (mismo criterio que el resto de este archivo -
        # cumplimiento real de permisos en escritura, plan Fase 1).
        if self.action == "create":
            return [require_permission("iam.crear")()]
        if self.action == "revoke":
            return [require_permission("iam.editar")()]
        return super().get_permissions()

    def get_queryset(self):
        queryset = IamUserRole.objects.for_scope(self.request.effective_scope).select_related(
            "role", "user"
        ).order_by("-granted_at")
        user_param = self.request.query_params.get("user")
        if user_param:
            queryset = queryset.filter(user_id=user_param)
        active_only = self.request.query_params.get("active")
        if active_only == "true":
            queryset = queryset.filter(revoked_at__isnull=True)
        return queryset

    def perform_create(self, serializer):
        serializer.save(granted_at=timezone.now())

    @action(detail=True, methods=["post"])
    def revoke(self, request, pk=None):
        user_role = self.get_object()
        if user_role.revoked_at is None:
            user_role.revoked_at = timezone.now()
            user_role.save(update_fields=["revoked_at"])
        return Response(self.get_serializer(user_role).data)


class GeneralSociedadViewSet(ModelViewSet):
    """Catalogo real de sociedades (tabla general_sociedades del ERD) -
    CRUD real (Fase 1, "Gestion organizacional", pantalla /admin/organizacion)
    ademas de alimentar el autocomplete de RFC en RoleAssignmentDialog
    (alcance SOCIEDAD). Busqueda de texto libre (?search=) sobre
    razon_social/rfc.

    A diferencia de Centro/Proyecto (que NO son catalogos genericos reales
    - pertenecen a modulos que todavia no existen, Tickets/Vivienda, ver
    memoria de sesion), Sociedad SI es un catalogo real y generico del ERD
    (general_sociedades), por eso es el unico con CRUD completo por ahora.

    DELETE es fisico (sin columna de soft-delete en el ERD real) - las
    referencias a sociedad_rfc en otros servicios (ej. PldContraparteKyc)
    son laxas (no FK real, por diseño de aislamiento de esquema), asi que
    borrar una sociedad no rompe integridad referencial a nivel de BD,
    pero SI deja esos registros con un RFC que ya no existe en el
    catalogo - usar con cuidado.
    """

    queryset = GeneralSociedad.objects.all().order_by("razon_social")
    serializer_class = GeneralSociedadSerializer
    filter_backends = [SearchFilter]
    search_fields = ["razon_social", "rfc", "alias_sociedad"]

    def get_permissions(self):
        if self.action == "create":
            return [require_permission("iam.crear")()]
        if self.action in ("update", "partial_update"):
            return [require_permission("iam.editar")()]
        if self.action == "destroy":
            return [require_permission("iam.editar")()]
        return super().get_permissions()


class IamUserGroupViewSet(ModelViewSet):
    """Cambiar la empresa de un usuario desde el Directorio (icono de lapiz
    en la columna "Empresa"). DELETE no permitido - se "quita" via revocar
    (removed_at), no se borra la fila (conserva historial). Filtra por
    ?user=<user_id>."""

    http_method_names = ["get", "post", "head", "options"]
    queryset = IamUserGroup.objects.select_related("group", "user").order_by("-created_at")
    serializer_class = IamUserGroupSerializer

    def get_permissions(self):
        if self.action == "create":
            return [require_permission("iam.crear")()]
        if self.action == "quitar":
            return [require_permission("iam.editar")()]
        return super().get_permissions()

    def get_queryset(self):
        queryset = super().get_queryset()
        user_param = self.request.query_params.get("user")
        if user_param:
            queryset = queryset.filter(user_id=user_param)
        active_only = self.request.query_params.get("active")
        if active_only == "true":
            queryset = queryset.filter(removed_at__isnull=True)
        return queryset

    @action(detail=True, methods=["post"])
    def quitar(self, request, pk=None):
        user_group = self.get_object()
        if user_group.removed_at is None:
            user_group.removed_at = timezone.now()
            user_group.save(update_fields=["removed_at"])
        return Response(self.get_serializer(user_group).data)


class IamUserCentroAccessViewSet(ModelViewSet):
    """Otorgar/revocar acceso CENTRO (grant plano, roles-y-permisos.md sec.
    1) - mismo patron que IamUserRoleViewSet. Filtra por ?user=<user_id>."""

    http_method_names = ["get", "post", "head", "options"]
    queryset = IamUserCentroAccess.objects.select_related("user").order_by("-granted_at")
    serializer_class = IamUserCentroAccessSerializer

    def get_permissions(self):
        if self.action == "create":
            return [require_permission("iam.crear")()]
        if self.action == "revoke":
            return [require_permission("iam.editar")()]
        return super().get_permissions()

    def get_queryset(self):
        queryset = super().get_queryset()
        user_param = self.request.query_params.get("user")
        if user_param:
            queryset = queryset.filter(user_id=user_param)
        active_only = self.request.query_params.get("active")
        if active_only == "true":
            queryset = queryset.filter(revoked_at__isnull=True)
        return queryset

    def perform_create(self, serializer):
        serializer.save(granted_at=timezone.now())

    @action(detail=True, methods=["post"])
    def revoke(self, request, pk=None):
        access = self.get_object()
        if access.revoked_at is None:
            access.revoked_at = timezone.now()
            access.save(update_fields=["revoked_at"])
        return Response(self.get_serializer(access).data)


class IamUserContratoAccessViewSet(ModelViewSet):
    """Otorgar/revocar acceso CONTRATO - mismo patron que
    IamUserCentroAccessViewSet, sobre un contrato individual."""

    http_method_names = ["get", "post", "head", "options"]
    queryset = IamUserContratoAccess.objects.select_related("user").order_by("-granted_at")
    serializer_class = IamUserContratoAccessSerializer

    def get_permissions(self):
        if self.action == "create":
            return [require_permission("iam.crear")()]
        if self.action == "revoke":
            return [require_permission("iam.editar")()]
        return super().get_permissions()

    def get_queryset(self):
        queryset = super().get_queryset()
        user_param = self.request.query_params.get("user")
        if user_param:
            queryset = queryset.filter(user_id=user_param)
        active_only = self.request.query_params.get("active")
        if active_only == "true":
            queryset = queryset.filter(revoked_at__isnull=True)
        return queryset

    def perform_create(self, serializer):
        serializer.save(granted_at=timezone.now())

    @action(detail=True, methods=["post"])
    def revoke(self, request, pk=None):
        access = self.get_object()
        if access.revoked_at is None:
            access.revoked_at = timezone.now()
            access.save(update_fields=["revoked_at"])
        return Response(self.get_serializer(access).data)


class IamMagicLinkViewSet(ModelViewSet):
    """Magic Links de un solo uso para usuarios externos (Fase 1, Semana 4;
    docs/architecture/README.md sec. 6.2).

    MODO DEV: no hay envio de correo real todavia (pendiente confirmar con
    Arturo el envio desde una cuenta de Workspace) - por eso "crear" regresa
    el token en claro y el link completo en la respuesta, en vez de solo
    enviarlo por correo. Quitar ese campo de la respuesta es el unico
    cambio necesario cuando exista el envio real (ver magic_link_utils.py).

    DELETE no esta permitido: un magic link no se borra, se revoca (mismo
    criterio que iam_user_roles) - usa POST /api/magic-links/{id}/revocar/.
    """

    http_method_names = ["get", "post", "head", "options"]
    queryset = IamMagicLink.objects.all().order_by("-issued_at")
    serializer_class = IamMagicLinkSerializer

    def get_permissions(self):
        # "validar" es el unico punto de entrada publico (el externo lo
        # canjea sin sesion, ver memoria de sesion "iam-magic-link-alcance")
        # - todo lo demas (crear/masivo/revocar/reenviar un link) es una
        # accion interna, requiere "iam.crear"/"iam.editar" como el resto.
        if self.action == "validar":
            return []
        if self.action in ("create", "masivo"):
            return [require_permission("iam.crear")()]
        if self.action in ("revocar", "reenviar"):
            return [require_permission("iam.editar")()]
        return super().get_permissions()

    def get_queryset(self):
        queryset = super().get_queryset()
        email_param = self.request.query_params.get("email")
        if email_param:
            queryset = queryset.filter(email__iexact=email_param)
        return queryset

    def create(self, request, *args, **kwargs):
        serializer = self.get_serializer(data=request.data)
        serializer.is_valid(raise_exception=True)

        token, token_hash = generate_token()
        expires_in_minutes = int(
            request.data.get("expires_in_minutes") or MAGIC_LINK_DEFAULT_EXPIRATION_MINUTES
        )
        magic_link = serializer.save(
            token_hash=token_hash,
            expires_at=timezone.now() + timedelta(minutes=expires_in_minutes),
        )

        emitir_evento_auditoria(
            "iam_magic_links.create",
            "iam_magic_links",
            magic_link.magic_link_id,
            actor_user_id=request.data.get("issued_by"),
            valores_nuevos={
                "email": magic_link.email,
                "recurso_tipo": magic_link.recurso_tipo,
                "recurso_id": magic_link.recurso_id,
                "expires_at": magic_link.expires_at.isoformat(),
            },
        )

        data = self.get_serializer(magic_link).data
        # Modo dev sin correo real (ver docstring de la clase) - remover
        # "token" y "magic_link_url" de aqui cuando exista el envio real.
        data["token"] = token
        data["magic_link_url"] = f"/magic-link/{token}"
        return Response(data, status=201)

    @action(detail=False, methods=["post"])
    def masivo(self, request):
        """Alta masiva de Magic Links (invitacion masiva por CSV, checklist
        Fase 1 - la invitacion individual ya la cubre create() de uno en
        uno). El CSV se parsea en el frontend (admin/magic-links); aqui solo
        llega una lista de correos ya separada, no un archivo.

        recurso_tipo/recurso_id/expires_in_minutes/issued_by son compartidos
        para toda la carga (mismo criterio para todos los invitados de un
        mismo CSV). Corres fila por fila en vez de bulk_create porque cada
        fila necesita su propio token en claro (nunca se guarda, ver
        magic_link_utils.generate_token) - no hay forma de recuperarlo
        despues de un insert masivo.

        No es atomico a proposito: si una fila falla (correo invalido,
        duplicado dentro del mismo CSV), las demas se crean igual y el
        detalle de cual fallo y por que va en "errores" - una fila mala en
        un CSV de 200 no debe tirar las otras 199.
        """
        emails = request.data.get("emails")
        if not isinstance(emails, list) or not emails:
            return Response({"emails": ["Este campo es requerido y debe ser una lista."]}, status=400)

        recurso_tipo = request.data.get("recurso_tipo") or None
        recurso_id = request.data.get("recurso_id") or None
        expires_in_minutes = int(
            request.data.get("expires_in_minutes") or MAGIC_LINK_DEFAULT_EXPIRATION_MINUTES
        )
        issued_by = request.data.get("issued_by") or None

        creados = []
        errores = []
        vistos = set()
        for raw_email in emails:
            email = (raw_email or "").strip()
            if not email:
                continue
            email_lower = email.lower()
            if email_lower in vistos:
                errores.append({"email": email, "detail": "Este correo ya aparece antes en la lista, se omitió."})
                continue
            vistos.add(email_lower)
            if not EMAIL_RE.match(email):
                errores.append({"email": email, "detail": "No parece un correo válido, revisa que esté bien escrito."})
                continue

            token, token_hash = generate_token()
            magic_link = IamMagicLink.objects.create(
                email=email,
                recurso_tipo=recurso_tipo,
                recurso_id=recurso_id,
                token_hash=token_hash,
                issued_by_id=issued_by,
                expires_at=timezone.now() + timedelta(minutes=expires_in_minutes),
            )
            emitir_evento_auditoria(
                "iam_magic_links.create",
                "iam_magic_links",
                magic_link.magic_link_id,
                actor_user_id=issued_by,
                valores_nuevos={
                    "email": magic_link.email,
                    "recurso_tipo": magic_link.recurso_tipo,
                    "recurso_id": magic_link.recurso_id,
                    "expires_at": magic_link.expires_at.isoformat(),
                    "origen": "carga_masiva_csv",
                },
            )

            data = self.get_serializer(magic_link).data
            data["token"] = token
            data["magic_link_url"] = f"/magic-link/{token}"
            creados.append(data)

        return Response({"creados": creados, "errores": errores}, status=201)

    @action(detail=False, methods=["post"])
    def validar(self, request):
        """Valida un token en claro (recibido en el link) y, si es valido,
        emite el JWT de alcance externo limitado. No requiere autenticacion
        - es el punto de entrada publico del flujo de Magic Link."""
        token = request.data.get("token")
        if not token:
            return Response({"token": ["Este campo es requerido."]}, status=400)

        try:
            magic_link = IamMagicLink.objects.get(token_hash=hash_token(token))
        except IamMagicLink.DoesNotExist:
            return Response({"detail": "Token invalido."}, status=404)

        now = timezone.now()
        if magic_link.revoked_at is not None:
            return Response({"detail": "Token revocado."}, status=410)
        if magic_link.expires_at < now:
            return Response({"detail": "Token expirado."}, status=410)
        if magic_link.uses_count >= magic_link.max_uses:
            return Response({"detail": "Token ya alcanzo su limite de usos."}, status=410)

        # Firmar primero: si esto falla, el link no debe darse por usado
        # (evita "quemar" un uso valido por un error de firma).
        jwt_token = issue_external_jwt(magic_link)

        magic_link.uses_count += 1
        magic_link.last_used_at = now
        if magic_link.first_used_at is None:
            magic_link.first_used_at = now
        magic_link.save(update_fields=["uses_count", "last_used_at", "first_used_at"])

        emitir_evento_auditoria(
            "iam_magic_links.use",
            "iam_magic_links",
            magic_link.magic_link_id,
            actor_user_id="externo",
            valores_nuevos={"email": magic_link.email, "uses_count": magic_link.uses_count},
        )

        return Response(
            {
                "magic_link": self.get_serializer(magic_link).data,
                "jwt": jwt_token,
            }
        )

    @action(detail=True, methods=["post"])
    def revocar(self, request, pk=None):
        magic_link = self.get_object()
        if magic_link.revoked_at is None:
            magic_link.revoked_at = timezone.now()
            magic_link.save(update_fields=["revoked_at"])
            emitir_evento_auditoria(
                "iam_magic_links.revoke",
                "iam_magic_links",
                magic_link.magic_link_id,
                actor_user_id=request.data.get("actor_user_id"),
                valores_nuevos={"email": magic_link.email},
            )
        return Response(self.get_serializer(magic_link).data)

    @action(detail=True, methods=["post"])
    def reenviar(self, request, pk=None):
        """Revoca el link actual y crea uno nuevo con el mismo
        email/recurso (mismo criterio de "reenvio" que pide el plan de
        trabajo Fase 1 Semana 4) - nunca se reutiliza el token viejo."""
        anterior = self.get_object()
        if anterior.revoked_at is None:
            anterior.revoked_at = timezone.now()
            anterior.save(update_fields=["revoked_at"])

        token, token_hash = generate_token()
        nuevo = IamMagicLink.objects.create(
            email=anterior.email,
            recurso_tipo=anterior.recurso_tipo,
            recurso_id=anterior.recurso_id,
            token_hash=token_hash,
            issued_by=anterior.issued_by,
            expires_at=timezone.now() + timedelta(minutes=MAGIC_LINK_DEFAULT_EXPIRATION_MINUTES),
            max_uses=anterior.max_uses,
        )
        emitir_evento_auditoria(
            "iam_magic_links.resend",
            "iam_magic_links",
            nuevo.magic_link_id,
            actor_user_id=request.data.get("actor_user_id"),
            valores_previos={"magic_link_id_anterior": anterior.magic_link_id},
            valores_nuevos={"email": nuevo.email, "expires_at": nuevo.expires_at.isoformat()},
        )

        data = self.get_serializer(nuevo).data
        data["token"] = token
        data["magic_link_url"] = f"/magic-link/{token}"
        return Response(data, status=201)


class IamInvitationViewSet(ModelViewSet):
    """Invitaciones formales de empleado nuevo (gate de _upsert_identity,
    ver auth_views.py y memoria de sesion "iam-invitacion-alcance-incierto").

    DELETE no esta permitido: una invitacion no se borra, se revoca (mismo
    criterio que iam_user_roles/iam_magic_links) - usa
    POST /api/invitaciones/{id}/revocar/.
    """

    http_method_names = ["get", "post", "head", "options"]
    queryset = IamInvitation.objects.all().order_by("-invited_at")
    serializer_class = IamInvitationSerializer

    def get_permissions(self):
        # Sin DEFAULT_PERMISSION_CLASSES en settings (DRF cae a AllowAny) -
        # sin este gate, list/retrieve quedaban abiertos a cualquiera, ni
        # siquiera con sesion, exponiendo correos de gente por invitar
        # (hallazgo 11/Ago/2026). Es territorio de administracion de IAM,
        # no lectura general - mismo perm_key que create.
        if self.action in ("create", "list", "retrieve"):
            return [require_permission("iam.crear")()]
        if self.action == "revocar":
            return [require_permission("iam.editar")()]
        return super().get_permissions()

    def get_queryset(self):
        queryset = super().get_queryset()
        email_param = self.request.query_params.get("email")
        if email_param:
            queryset = queryset.filter(email__iexact=email_param)
        pendientes = self.request.query_params.get("pendientes")
        if pendientes == "true":
            queryset = queryset.filter(accepted_at__isnull=True, revoked_at__isnull=True)
        return queryset

    def create(self, request, *args, **kwargs):
        email = (request.data.get("email") or "").strip()
        if not email:
            return Response({"email": ["Este campo es requerido."]}, status=400)
        if IamUser.objects.filter(primary_email__iexact=email).exists():
            return Response(
                {"email": ["Ya existe una cuenta con este correo, no necesita invitación."]}, status=400
            )
        if IamInvitation.objects.filter(
            email__iexact=email, accepted_at__isnull=True, revoked_at__isnull=True
        ).exists():
            return Response({"email": ["Ya hay una invitación pendiente para este correo."]}, status=400)

        serializer = self.get_serializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        invitation = serializer.save()

        emitir_evento_auditoria(
            "iam_invitations.create",
            "iam_invitations",
            invitation.invitation_id,
            actor_user_id=request.data.get("invited_by"),
            valores_nuevos={"email": invitation.email},
        )
        return Response(self.get_serializer(invitation).data, status=201)

    @action(detail=True, methods=["post"])
    def revocar(self, request, pk=None):
        invitation = self.get_object()
        if invitation.accepted_at is not None:
            return Response({"detail": "Esta invitación ya fue aceptada, no se puede revocar."}, status=400)
        if invitation.revoked_at is None:
            invitation.revoked_at = timezone.now()
            invitation.save(update_fields=["revoked_at"])
            emitir_evento_auditoria(
                "iam_invitations.revoke",
                "iam_invitations",
                invitation.invitation_id,
                actor_user_id=request.data.get("actor_user_id"),
                valores_nuevos={"email": invitation.email},
            )
        return Response(self.get_serializer(invitation).data)
