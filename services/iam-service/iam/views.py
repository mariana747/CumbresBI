import re
from datetime import timedelta

from cumbresbi_scope.permissions import require_permission
from django.conf import settings
from django.db.models import Count, Q
from django.utils import timezone
from rest_framework.decorators import action
from rest_framework.exceptions import ValidationError
from rest_framework.filters import SearchFilter
from rest_framework.response import Response
from rest_framework.viewsets import ModelViewSet, ReadOnlyModelViewSet

from .audit_utils import emitir_evento_auditoria
from .magic_link_utils import generate_token, hash_token, issue_external_jwt
from .mail_utils import (
    enviar_correo_acceso_externo,
    enviar_correo_invitacion_workspace,
    enviar_correo_magic_link,
)
from .models import (
    GeneralSociedad,
    IamExternalCollaborator,
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
    IamExternalCollaboratorSerializer,
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
        else:
            # Eliminado (14/Ago/2026, ver IamUserViewSet.eliminar) no debe
            # aparecer en el directorio por defecto - solo se ve si alguien
            # filtra a proposito por ?status=DELETED (mismo criterio que
            # "Eliminado" ya en el selector de /admin/usuarios). Es borrado
            # logico, no real, asi que sigue existiendo la fila, solo no
            # estorba la vista normal del dia a dia.
            queryset = queryset.exclude(status=IamUser.STATUS_DELETED)
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
        # Interno (STANDARD, Workspace) vs externo (RESTRICTED, ver
        # IamExternalCollaboratorViewSet.create) - filtro pedido para el
        # directorio, ver /admin/usuarios.
        access_mode_param = self.request.query_params.get("access_mode")
        if access_mode_param:
            queryset = queryset.filter(access_mode=access_mode_param.upper())
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

    def get_permissions(self):
        if self.action in ("eliminar", "reactivar", "suspender"):
            return [require_permission("iam.editar")()]
        return super().get_permissions()

    @action(detail=True, methods=["post"])
    def suspender(self, request, pk=None):
        """Suspende un usuario ACTIVE (14/Ago/2026, pedido explicito:
        "para los pertenecientes al workspace no se deben poder revocar
        las invitacion, pero si suspender" - IamInvitationViewSet.revocar
        ya rechaza revocar una invitacion ya aceptada (ver docstring de esa
        accion), asi que para cortarle el acceso a alguien que YA es
        colaborador Workspace hacia falta este boton en vez de intentar
        revocar algo que ya no se puede.

        A diferencia de eliminar() (borrado logico, requiere invitacion
        nueva para volver), esto es reversible con un clic via reactivar()
        - pensado para suspensiones temporales, no para dar de baja.

        NO revoca roles (14/Ago/2026, ajustado - pedido explicito: "al
        volver a activar al usuario se debe dar sus roles el automatico").
        A diferencia de eliminar(), aqui los roles se quedan intactos -
        el gate real ya vive en el status (google_callback/
        canjear_acceso_externo rechazan a cualquiera que no este ACTIVE),
        asi que no hace falta revocarlos para que dejen de funcionar, y
        reactivar() los recupera "solos" porque nunca se tocaron."""
        user = self.get_object()
        if user.user_id == request.data.get("actor_user_id"):
            return Response({"detail": "No puedes suspender tu propio usuario."}, status=400)
        if user.status != IamUser.STATUS_ACTIVE:
            return Response({"detail": "Solo se puede suspender un usuario activo."}, status=400)

        user.status = IamUser.STATUS_SUSPENDED
        user.save(update_fields=["status"])

        emitir_evento_auditoria(
            "iam_users.suspend",
            "iam_users",
            user.user_id,
            actor_user_id=request.data.get("actor_user_id"),
            valores_nuevos={"email": user.primary_email},
        )
        return Response(self.get_serializer(user).data)

    @action(detail=True, methods=["post"])
    def eliminar(self, request, pk=None):
        """Borrado logico (14/Ago/2026, pedido explicito de Mariana tras
        encontrar un usuario de prueba atorado en SUSPENDED sin forma de
        quitarlo del directorio). NO es un DELETE de fila real: hay
        FKs con on_delete=PROTECT hacia IamUser desde media tabla del
        sistema (created_by/issued_by/granted_by/invited_by en varios
        modelos) - borrar la fila de verdad tronaria en cuanto ese usuario
        hubiera creado/otorgado/invitado algo. STATUS_DELETED ya existia
        como choice del modelo (y en el filtro de /admin/usuarios) pero
        nada lo emitia todavia - esta accion es lo que faltaba.

        Revoca tambien cualquier rol activo (mismo criterio que
        canjear_acceso_externo/google_callback en auth_views.py, que ya
        rechazan login a quien no este ACTIVE): un usuario eliminado no
        debe conservar accesos vigentes solo porque nadie los revoco a
        mano."""
        user = self.get_object()
        if user.user_id == request.data.get("actor_user_id"):
            return Response({"detail": "No puedes eliminar tu propio usuario."}, status=400)
        if user.status == IamUser.STATUS_DELETED:
            return Response(self.get_serializer(user).data)

        user.status = IamUser.STATUS_DELETED
        user.save(update_fields=["status"])
        IamUserRole.objects.filter(user=user, revoked_at__isnull=True).update(revoked_at=timezone.now())

        emitir_evento_auditoria(
            "iam_users.delete",
            "iam_users",
            user.user_id,
            actor_user_id=request.data.get("actor_user_id"),
            valores_nuevos={"email": user.primary_email},
        )
        return Response(self.get_serializer(user).data)

    @action(detail=True, methods=["post"])
    def reactivar(self, request, pk=None):
        """Reactiva un usuario SUSPENDED (14/Ago/2026, pedido explicito:
        "cuando un usuario esta suspendido se le desactivan sus funciones
        y se debe tener un boton para activarlo nuevamente"). El gate real
        de "funciones desactivadas" ya vive en auth_views.py
        (google_callback/canjear_acceso_externo rechazan a cualquiera que
        no este ACTIVE) - esta accion es el boton para deshacerlo.

        Solo desde SUSPENDED, no desde DELETED: un usuario eliminado tiene
        su propio camino de vuelta (invitacion nueva -> _upsert_identity lo
        reactiva al aceptar, ver auth_views.py) porque ahi si hace falta
        confirmar que sigue siendo alguien que debe tener acceso - un
        simple boton de "reactivar" seria demasiado facil para deshacer un
        borrado a proposito.

        NO reactiva por si sola un IamExternalCollaborator revocado (si la
        suspension vino de ahi, ver IamExternalCollaboratorViewSet.revocar)
        - el admin todavia necesita "Reenviar" ese acceso para darle un
        link usable de nuevo; reactivar aqui solo le devuelve a un usuario
        Workspace su login libre normal."""
        user = self.get_object()
        if user.status != IamUser.STATUS_SUSPENDED:
            return Response({"detail": "Solo se puede reactivar un usuario suspendido."}, status=400)

        user.status = IamUser.STATUS_ACTIVE
        user.save(update_fields=["status"])

        emitir_evento_auditoria(
            "iam_users.reactivate",
            "iam_users",
            user.user_id,
            actor_user_id=request.data.get("actor_user_id"),
            valores_nuevos={"email": user.primary_email},
        )
        return Response(self.get_serializer(user).data)


class IamRoleViewSet(ModelViewSet):
    """Catalogo de roles para el filtro del directorio de usuarios y, via el
    campo "permisos" del serializer, la matriz de permisos roles x permisos
    (Fase 1, Semana 5).

    31/Ago/2026 (pedido de Mariana: "super admin debe poder crear roles
    para colaboradores externos" - hasta ahora un SUPER_ADMIN podia
    otorgar/acotar el ALCANCE de un rol ya existente via RoleAssignmentDialog,
    pero no podia crear un rol nuevo de cero con exactamente los permisos
    que necesitaba - ej. "solo PLD" para un abogado externo - sin tocar
    Django admin). create() ya existe.

    "se pueden borrar?" -> soft-delete via desactivar()/activar() para el
    caso normal (un rol puede tener IamUserRole ya asignadas; borrar la
    fila tumbaria el acceso de quien lo tuviera sin aviso ni registro).
    Un rol inactivo ya no se puede asignar a nadie nuevo (ver
    IamUserRoleViewSet.perform_create) pero las asignaciones existentes NO
    se revocan solas.

    31/Ago/2026 (pedido de Mariana: "quiero agregar tambien un borrado
    real"): destroy() SI esta expuesto, pero bloqueado (400) si el rol
    tiene alguna IamUserRole activa (revoked_at IS NULL) - solo se puede
    borrar de verdad un rol que nadie tiene asignado hoy. role.user_roles
    usa on_delete=CASCADE (ver IamUserRole.role), asi que el DELETE real
    tambien se lleva las asignaciones YA REVOCADAS de ese rol (pierde ese
    pedacito de historial) - aceptable porque el caso de uso es "cree un
    rol de prueba/me equivoque y nadie lo llego a usar en serio", no
    limpieza de roles con historial real."""

    http_method_names = ["get", "post", "delete", "head", "options"]
    queryset = IamRole.objects.all().order_by("role_name")
    serializer_class = IamRoleSerializer

    def get_permissions(self):
        # Crear un rol nuevo = "iam.crear" (mismo criterio que
        # IamUserRoleViewSet.create). Editar la matriz de permisos
        # (otorgar/revocar), activar/desactivar y borrar requieren "iam.editar".
        if self.action == "create":
            return [require_permission("iam.crear")()]
        if self.action in ("otorgar_permiso", "revocar_permiso", "activar", "desactivar", "destroy"):
            return [require_permission("iam.editar")()]
        return super().get_permissions()

    def destroy(self, request, *args, **kwargs):
        role = self.get_object()
        if role.user_roles.filter(revoked_at__isnull=True).exists():
            return Response(
                {"detail": "Este rol tiene usuarios con la asignación activa, no se puede borrar. Desactívalo en su lugar."},
                status=400,
            )
        return super().destroy(request, *args, **kwargs)

    def perform_create(self, serializer):
        actor = IamUser.objects.filter(pk=self.request.effective_scope.identity_user_id).first()
        if not actor:
            raise ValidationError({"detail": "No se pudo identificar al usuario autenticado."})
        serializer.save(created_by=actor, updated_by=actor)

    @action(detail=True, methods=["post"])
    def desactivar(self, request, pk=None):
        actor = IamUser.objects.filter(pk=request.effective_scope.identity_user_id).first()
        if not actor:
            return Response({"detail": "No se pudo identificar al usuario autenticado."}, status=400)
        role = self.get_object()
        role.activo = False
        role.updated_by = actor
        role.save(update_fields=["activo", "updated_by", "updated_at"])
        return Response(self.get_serializer(role).data)

    @action(detail=True, methods=["post"])
    def activar(self, request, pk=None):
        actor = IamUser.objects.filter(pk=request.effective_scope.identity_user_id).first()
        if not actor:
            return Response({"detail": "No se pudo identificar al usuario autenticado."}, status=400)
        role = self.get_object()
        role.activo = True
        role.updated_by = actor
        role.save(update_fields=["activo", "updated_by", "updated_at"])
        return Response(self.get_serializer(role).data)

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
        # 31/Ago/2026: un rol desactivado (IamRole.activo=False) ya no se
        # puede otorgar a nadie nuevo - las asignaciones que ya existian
        # antes de desactivarlo siguen vigentes hasta que alguien las
        # revoque a mano, esto solo cierra la puerta a asignaciones NUEVAS.
        role = serializer.validated_data.get("role")
        if role and not role.activo:
            raise ValidationError({"role": ["Este rol está desactivado, no se puede asignar."]})
        # Un rol EXTERNO nunca se otorga en alcance GLOBAL (pedido de
        # Mariana: "en externos se debe asignar su sociedad y proyecto") -
        # el backend rechaza el caso mas grave (GLOBAL) aunque alguien
        # llame la API directo sin pasar por RoleAssignmentDialog. El
        # frontend exige ademas Sociedad Y Proyecto los dos (dos filas de
        # IamUserRole, una por dimension) - eso no se puede validar en una
        # sola fila aqui, queda como responsabilidad de la UI.
        if role and role.tipo == IamRole.TIPO_EXTERNO and serializer.validated_data.get("scope_type") == IamUserRole.SCOPE_GLOBAL:
            raise ValidationError({"scope_type": ["Un rol externo no se puede otorgar con alcance GLOBAL."]})
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

    Envio real por correo (13/Ago/2026, ver mail_utils.py): al crear un
    link (uno a uno o masivo por CSV) o reenviarlo, se manda de verdad a
    la bandeja del invitado via mail-service/Gmail API. El token/
    magic_link_url se siguen regresando en la respuesta como respaldo (el
    analista puede copiarlo a mano si el correo no llega o mail-service
    todavia esta en modo simulado sin credencial real) - "correo_enviado"
    en la respuesta indica si el envio real funciono.

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

        magic_link_url = f"/magic-link/{token}"
        correo_enviado = enviar_correo_magic_link(request, magic_link.email, magic_link_url)

        data = self.get_serializer(magic_link).data
        # token/magic_link_url se quedan como respaldo (ver docstring de la
        # clase) - no reemplazan el envio real, solo cubren el caso de que
        # falle o mail-service siga en modo simulado.
        data["token"] = token
        data["magic_link_url"] = magic_link_url
        data["correo_enviado"] = correo_enviado
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

            magic_link_url = f"/magic-link/{token}"
            correo_enviado = enviar_correo_magic_link(request, magic_link.email, magic_link_url)

            data = self.get_serializer(magic_link).data
            data["token"] = token
            data["magic_link_url"] = magic_link_url
            data["correo_enviado"] = correo_enviado
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

        magic_link_url = f"/magic-link/{token}"
        correo_enviado = enviar_correo_magic_link(request, nuevo.email, magic_link_url)

        data = self.get_serializer(nuevo).data
        data["token"] = token
        data["magic_link_url"] = magic_link_url
        data["correo_enviado"] = correo_enviado
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
        # Solo dominios de Workspace aprobados (14/Ago/2026, pedido
        # explicito de Mariana): la invitacion formal (IamInvitation) es
        # para quien SI tiene/tendra cuenta real de Google Workspace y
        # entra por OIDC (dominio_aprobado en oidc_utils.py exige lo
        # mismo en el login) - alguien de otro dominio nunca podria
        # canjearla, es un colaborador externo (IamExternalCollaborator,
        # pestaña "Externos sin Workspace" en /admin/invitaciones).
        dominio = email.rsplit("@", 1)[-1].lower() if "@" in email else ""
        if dominio not in [d.lower() for d in settings.OIDC_APPROVED_DOMAINS]:
            return Response(
                {
                    "email": [
                        f"'{dominio or email}' no es un dominio de Workspace aprobado. "
                        "Si esta persona no tiene correo de Workspace, usa "
                        "'Externos sin Workspace' en vez de esta invitación."
                    ]
                },
                status=400,
            )
        # exclude(status=DELETED) (14/Ago/2026, hallazgo al agregar
        # IamUserViewSet.eliminar): un usuario eliminado no debe quedar en
        # un callejon sin salida (no puede loguearse por el gate de status
        # en google_callback, pero tampoco se le podia volver a invitar
        # porque esta fila con status=DELETED seguia contando como "ya
        # existe una cuenta"). _upsert_identity reactiva el status al
        # aceptar (ver mas abajo).
        if IamUser.objects.filter(primary_email__iexact=email).exclude(status=IamUser.STATUS_DELETED).exists():
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

        correo_enviado = enviar_correo_invitacion_workspace(request, invitation.email)
        data = self.get_serializer(invitation).data
        data["correo_enviado"] = correo_enviado
        return Response(data, status=201)

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


class IamExternalCollaboratorViewSet(ModelViewSet):
    """3er tipo de acceso externo (14/Ago/2026, ver models.py y memoria de
    sesion "tercer-tipo-invitacion-externo-sin-workspace"): colaborador sin
    correo de Workspace, entra a secciones reales via roles/permisos
    normales, con un link que NO vence por tiempo (solo revocar()).

    A diferencia de IamMagicLinkViewSet, "canjear" el token no vive aqui -
    ese paso emite la cookie de sesion real (mismo mecanismo que
    /auth/google/callback) y por eso es una vista de navegador en
    auth_views.canjear_acceso_externo, no una accion de este ViewSet.

    DELETE no esta permitido: se revoca, mismo criterio que magic
    links/invitaciones.
    """

    http_method_names = ["get", "post", "head", "options"]
    queryset = IamExternalCollaborator.objects.all().order_by("-invited_at")
    serializer_class = IamExternalCollaboratorSerializer

    def get_permissions(self):
        if self.action in ("create", "list", "retrieve"):
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
        email = (request.data.get("email") or "").strip()
        if not email:
            return Response({"email": ["Este campo es requerido."]}, status=400)
        if not EMAIL_RE.match(email):
            return Response({"email": ["No parece un correo válido, revisa que esté bien escrito."]}, status=400)
        # exclude(status=DELETED) (14/Ago/2026, mismo hallazgo que
        # IamInvitationViewSet.create): un usuario eliminado no debe
        # bloquear un acceso externo nuevo para el mismo correo - se crea
        # un IamUser nuevo (el eliminado se queda como historial muerto,
        # sin OneToOne con el IamExternalCollaborator nuevo).
        if IamUser.objects.filter(primary_email__iexact=email).exclude(status=IamUser.STATUS_DELETED).exists():
            return Response({"email": ["Ya existe una cuenta con este correo."]}, status=400)
        if IamExternalCollaborator.objects.filter(email__iexact=email, revoked_at__isnull=True).exists():
            return Response({"email": ["Ya hay un acceso externo activo para este correo."]}, status=400)

        display_name = request.data.get("display_name") or None
        invited_by = request.data.get("invited_by") or None

        # access_mode RESTRICTED: es un colaborador externo, no un
        # empleado interno - documenta la intencion aunque hoy
        # ScopedManager no distinga por access_mode (gap ya conocido, ver
        # IamUser.access_mode en models.py).
        user = IamUser.objects.create(
            primary_email=email,
            display_name=display_name,
            access_mode=IamUser.ACCESS_RESTRICTED,
        )

        token, token_hash = generate_token()
        acceso = IamExternalCollaborator.objects.create(
            user=user,
            email=email,
            token_hash=token_hash,
            invited_by_id=invited_by,
        )

        emitir_evento_auditoria(
            "iam_external_collaborators.create",
            "iam_external_collaborators",
            acceso.external_access_id,
            actor_user_id=invited_by,
            valores_nuevos={"email": acceso.email, "user_id": user.user_id},
        )

        acceso_url = f"/acceso-externo/{token}"
        correo_enviado = enviar_correo_acceso_externo(request, acceso.email, acceso_url)

        data = self.get_serializer(acceso).data
        # token/acceso_url se quedan como respaldo, mismo criterio que
        # IamMagicLinkViewSet.create (correo_enviado indica si el envio
        # real funciono).
        data["token"] = token
        data["acceso_url"] = acceso_url
        data["correo_enviado"] = correo_enviado
        return Response(data, status=201)

    @action(detail=True, methods=["post"])
    def revocar(self, request, pk=None):
        """Revocar el acceso externo elimina al usuario de una vez (14/Ago/2026,
        pedido explicito: "al revocar invitacion se elimina de la lista de
        usuarios automaticamente") - a diferencia de suspender (reversible
        con un clic), aqui no tiene sentido "reactivar" sin antes darle un
        link nuevo (reenviar()), asi que el borrado logico es el estado
        correcto: desaparece del Directorio por defecto (ver
        IamUserViewSet.get_queryset, excluye DELETED) y revoca sus roles
        activos, igual que IamUserViewSet.eliminar()."""
        acceso = self.get_object()
        if acceso.revoked_at is None:
            acceso.revoked_at = timezone.now()
            acceso.save(update_fields=["revoked_at"])
            acceso.user.status = IamUser.STATUS_DELETED
            acceso.user.save(update_fields=["status"])
            IamUserRole.objects.filter(user=acceso.user, revoked_at__isnull=True).update(revoked_at=timezone.now())
            emitir_evento_auditoria(
                "iam_external_collaborators.revoke",
                "iam_external_collaborators",
                acceso.external_access_id,
                actor_user_id=request.data.get("actor_user_id"),
                valores_nuevos={"email": acceso.email},
            )
        return Response(self.get_serializer(acceso).data)

    @action(detail=True, methods=["post"])
    def reenviar(self, request, pk=None):
        """Rota el token (revoca el link viejo, emite uno nuevo para el
        MISMO usuario/rol ya asignado) - util si el link se comparte por
        error. No crea un IamUser nuevo, solo cambia el token_hash."""
        anterior = self.get_object()
        if anterior.revoked_at is not None:
            return Response({"detail": "Este acceso ya esta revocado, no se puede reenviar."}, status=400)

        token, token_hash = generate_token()
        anterior.token_hash = token_hash
        anterior.save(update_fields=["token_hash"])

        emitir_evento_auditoria(
            "iam_external_collaborators.resend",
            "iam_external_collaborators",
            anterior.external_access_id,
            actor_user_id=request.data.get("actor_user_id"),
            valores_nuevos={"email": anterior.email},
        )

        acceso_url = f"/acceso-externo/{token}"
        correo_enviado = enviar_correo_acceso_externo(request, anterior.email, acceso_url)

        data = self.get_serializer(anterior).data
        data["token"] = token
        data["acceso_url"] = acceso_url
        data["correo_enviado"] = correo_enviado
        return Response(data, status=200)
