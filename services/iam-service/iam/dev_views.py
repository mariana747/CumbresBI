"""TEMPORAL - borrar antes de exponer este servicio a produccion real.

Switch de rol sin volver a pasar por el login real de Google, para poder
revisar rol por rol el gating de la UI (sidebar/panel/botones de
escritura, ver AppShell.tsx y roles-y-permisos.md) sin hacer un login
OIDC completo por cada uno de los 17 roles del catalogo (decision de
producto 11/Ago/2026, ver plan de la sesion). Requiere una sesion real de
Google ya activa (lee el user_id del JWT actual) - solo reescribe las
IamUserRole/IamUserCentroAccess de ESE usuario y reemite el JWT, no crea
usuarios nuevos ni bypassa el login inicial.

Gate de seguridad: 404 inmediato si settings.DEBUG es False (ver tambien
el bloque `if settings.DEBUG` en config/urls.py, que ni siquiera registra
esta ruta en produccion) - doble candado a proposito, uno de la vista y
uno del ruteo.

Al terminar la ronda de revision de roles: borrar este archivo, el bloque
de URL en config/urls.py y frontend/src/app/dev/roles/page.tsx (dejar
nota en docs/CumbresBI_estado.md).
"""

from django.conf import settings
from django.http import HttpResponseBadRequest, HttpResponseNotFound, JsonResponse
from django.shortcuts import redirect
from django.utils import timezone
from django.views.decorators.csrf import csrf_exempt
from django.views.decorators.http import require_GET

from .models import IamRole, IamUser, IamUserCentroAccess, IamUserRole
from .session_utils import decode_session_jwt, issue_session_jwt

_SCOPE_TYPES_VALIDOS = {choice[0] for choice in IamUserRole.SCOPE_TYPE_CHOICES}


@csrf_exempt
@require_GET
def dev_role_switch(request):
    if not settings.DEBUG:
        return HttpResponseNotFound()

    token = request.COOKIES.get(settings.SESSION_COOKIE_NAME_JWT)
    claims = decode_session_jwt(token) if token else None
    if not claims:
        return JsonResponse(
            {"detail": "Necesitas un login real de Google primero (este switch no crea sesiones nuevas)."},
            status=401,
        )

    # "?role=A,B" (separado por comas) para probar la UNION de permisos de
    # varios roles a la vez (roles-y-permisos.md sec. 4: "un usuario puede
    # tener varios roles activos en la misma sesion", los perm_keys se
    # suman, nunca se quitan) - el caso normal sigue siendo un solo rol.
    roles_pedidos = [r.strip() for r in request.GET.get("role", "").split(",") if r.strip()]
    if not roles_pedidos:
        return HttpResponseBadRequest("Falta ?role=ROLE_KEY (o varios separados por coma)")
    roles = list(IamRole.objects.filter(role_key__in=roles_pedidos))
    encontrados = {r.role_key for r in roles}
    faltantes = set(roles_pedidos) - encontrados
    if faltantes:
        return HttpResponseBadRequest(f"role_key desconocido: {', '.join(sorted(faltantes))}")

    scope_type = request.GET.get("scope_type", IamUserRole.SCOPE_GLOBAL)
    if scope_type not in _SCOPE_TYPES_VALIDOS:
        return HttpResponseBadRequest(f"scope_type invalido: {scope_type}")
    scope_id = request.GET.get("scope_id", "*")

    user = IamUser.objects.get(user_id=claims["sub"])
    now = timezone.now()

    # Mismo patron usado a mano toda la sesion de revision: borrar los
    # roles activos del usuario y dejar solo los que se estan probando
    # (uno o varios), para que la UI se vea "limpia" (sin permisos
    # acumulados de pruebas anteriores mezclados) - mismo scope_type para
    # todos por simplicidad de esta herramienta de dev.
    IamUserRole.objects.filter(user=user).delete()
    for role in roles:
        IamUserRole.objects.create(
            user=user,
            role=role,
            scope_type=scope_type,
            scope_id=scope_id,
            granted_by=user,
            granted_at=now,
        )

    # RRHH_SUPERVISOR_CENTRO es CENTRO (grant plano aparte, no scope_type -
    # ver IamUserCentroAccess) - si se pide un centro_id de prueba, se
    # simula igual que se hizo a mano para ese rol en el plan.
    centro_id = request.GET.get("centro_id")
    if centro_id:
        IamUserCentroAccess.objects.filter(user=user).delete()
        IamUserCentroAccess.objects.create(user=user, centro_id=centro_id, granted_by=user, granted_at=now)

    session_jwt = issue_session_jwt(user)
    response = redirect(settings.OIDC_FRONTEND_SUCCESS_URL)
    response.set_cookie(
        settings.SESSION_COOKIE_NAME_JWT,
        session_jwt,
        max_age=settings.SESSION_JWT_TTL_MINUTES * 60,
        httponly=True,
        samesite="Lax",
    )
    return response
