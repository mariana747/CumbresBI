"use client";

import { useEffect, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import {
  AppBar,
  Avatar,
  Badge,
  Box,
  Chip,
  Collapse,
  Divider,
  Drawer,
  IconButton,
  List,
  ListItemButton,
  ListItemIcon,
  ListItemText,
  Menu,
  MenuItem,
  Stack,
  Toolbar,
  Typography,
  useMediaQuery,
  useTheme,
} from "@mui/material";
import {
  LayoutDashboard,
  ShieldCheck,
  KeyRound,
  FileSearch,
  ClipboardList,
  Link2,
  Building2,
  Landmark,
  Users,
  UserRound,
  UserPlus,
  ScrollText,
  Bell,
  ChevronDown,
  ChevronRight,
  Menu as MenuIcon,
  type LucideIcon,
} from "lucide-react";
import { SessionUser, getSession, puedeAdministrarIam, tieneAccesoIam, tieneAccesoPld, tieneAlgunPermiso } from "@/lib/auth";
import { IamUser, listUsers } from "@/lib/iam";
import { Footer } from "@/components/Footer";
import { BRAND } from "@/theme/theme";

const DRAWER_WIDTH = 240;
const HEADER_HEIGHT = 56;

// Catalogo de modulos de negocio en el orden confirmado del Plan de Trabajo
// v2.0 (docs/architecture/README.md sec. 2): Admin -> PLD -> Ventas/Vivienda
// -> Compras/Tesoreria -> RRHH. Ninguno tiene ruta real todavia (Fase 0) -
// href queda en "#" hasta que exista el modulo correspondiente.
//
// Nota de producto (confirmada): esta lista es un placeholder de Fase 0 -
// cuando exista login real, debe filtrarse contra el alcance efectivo del
// usuario (roles-y-permisos.md), no mostrarse completa con items
// deshabilitados como aqui.
//
// "children": submenu desplegable dentro del sidebar (reemplaza el patron
// anterior de pestañas horizontales arriba de la pagina, ver AdminTabs.tsx
// - decision de diseno: la navegacion entre pantallas de un mismo modulo
// vive en el sidebar, no repetida en cada pantalla). Mismo patron pensado
// para reutilizarse en los demas modulos (PLD, Ventas, etc.) en cuanto
// tengan mas de una pantalla propia - hoy solo Admin (IAM) lo necesita.
// Tipos explicitos (en vez de `as const` + `typeof NAV_ITEMS[number]`) para
// evitar el choque de tipos entre el `icon` de lucide-react
// (ForwardRefExoticComponent con su propio WeakValidationMap de propTypes)
// y un `React.ComponentType<{size?, strokeWidth?}>` hecho a mano - con
// `LucideIcon` real como tipo de icono, la union queda limpia y
// `"children" in item` narrowa sin conflicto.
type NavChild = { label: string; href: string; icon: LucideIcon };
type NavLeaf = { label: string; href: string; icon: LucideIcon; enabled: boolean };
type NavParent = NavLeaf & { children: readonly NavChild[] };
export type NavItem = NavLeaf | NavParent;

// "Auditar > Bitácora" - mismo destino (/admin/reportes?tab=auditoria) para
// los dos roles que pueden llegar ahi, pero en un lugar distinto del menu
// segun el rol (decision de producto 11/Ago/2026): quien administra IAM lo
// ve anidado dentro de "Admin (IAM)" (es una funcion mas de administracion
// para el); AUDITOR no tiene Admin(IAM) en absoluto, asi que le toca como
// seccion propia de primer nivel. El gate real sigue siendo el backend
// (audit-service: GLOBAL o role AUDITOR, ver auditoria/views.py) - esto
// solo decide DONDE aparece el link, no quien puede usarlo.
const AUDITAR_ITEM: NavChild = { label: "Bitácora", href: "/admin/reportes?tab=auditoria", icon: ScrollText };

// Encabezado del apartado con el nombre del rol especifico de la sesion
// en vez de un nombre generico de modulo (decision de producto
// 11/Ago/2026) - varios roles distintos comparten el mismo apartado (ej.
// PLD_ANALISTA y PLD_APROBADOR ambos ven "PLD"), asi que cada uno debe
// reconocer su propia etiqueta ahi. Sin rol especifico de ese modulo
// (ej. SUPER_ADMIN, que no es "un" PLD_ANALISTA) se queda el nombre
// generico del modulo.
// Nombres amigables (17/Ago/2026, menu de la carita de perfil) - espejo de
// los role_name del seed (iam-service/iam/migrations/0002_seed_roles_grupos.py),
// para no mostrarle al usuario la clave cruda tipo "SUPER_ADMIN".
const ROLE_LABELS: Record<string, string> = {
  SUPER_ADMIN: "Super Admin",
  IAM_ADMIN: "Administrador IAM",
  AUDITOR: "Auditor / Compliance Officer",
  PLD_ANALISTA: "Analista PLD/KYC",
  PLD_APROBADOR: "Aprobador PLD (Compliance Manager)",
  VENTAS_ASESOR: "Asesor de Ventas",
  VENTAS_GERENTE: "Gerente de Ventas/Proyecto",
  OBRA_COORDINADOR: "Coordinador de Obra",
  FINANZAS_MANAGER: "Finance Manager",
  TESORERIA_ANALISTA: "Analista de Tesorería",
  COMPRAS_ANALISTA: "Comprador / Analista de Compras",
  CONTRALOR: "Contralor / CFO",
  RRHH_SUPERVISOR_CENTRO: "Supervisor de Centro",
  RRHH_ADMIN: "Administrador RRHH",
  EMPLEADO_SELF: "Empleado (portal MiCumbres)",
  TICKETS_RESPONSABLE: "Responsable de Proyecto",
  TICKETS_PARTICIPANTE: "Participante de Ticket",
};

function etiquetaAdminIam(session: SessionUser | null): string {
  if (session?.role_keys.includes("SUPER_ADMIN")) return "Super Admin";
  if (session?.role_keys.includes("IAM_ADMIN")) return "Admin IAM";
  return "Admin (IAM)";
}

function etiquetaPld(session: SessionUser | null): string {
  if (session?.role_keys.includes("PLD_ANALISTA")) return "Analista PLD";
  if (session?.role_keys.includes("PLD_APROBADOR")) return "Aprobador PLD";
  return "PLD / Cumplimiento";
}

// Cada apartado del sidebar se agrega solo si el rol de la sesion lo
// necesita (antes se mostraba todo a cualquiera con sesion - placeholder
// de Fase 0, ver git blame) - construye el arbol en vez de filtrar uno
// fijo porque "Auditar" cambia de posicion segun el rol (ver AUDITAR_ITEM).
// Exportado para AppShell.test.ts (11/Ago/2026) - es una funcion pura
// (SessionUser | null) => NavItem[], no necesita cambios de logica para
// ser probada, solo dejar de ser privada del modulo.
export function buildNavItems(session: SessionUser | null): NavItem[] {
  const items: NavItem[] = [{ label: "Panel", href: "/", icon: LayoutDashboard, enabled: true }];

  if (puedeAdministrarIam(session)) {
    items.push({
      label: etiquetaAdminIam(session),
      href: "/admin/usuarios",
      icon: ShieldCheck,
      enabled: true,
      children: [
        { label: "Usuarios", href: "/admin/usuarios", icon: UserRound },
        { label: "Invitaciones", href: "/admin/invitaciones", icon: UserPlus },
        { label: "Permisos", href: "/admin/permisos", icon: KeyRound },
        // "Reportes" y "Bitácora" eran dos entradas de menú separadas para
        // la MISMA pantalla (/admin/reportes) - la pestaña "Bitácora de
        // auditoría" ya vive ahi dentro (ver SUB_REPORTES en
        // admin/reportes/page.tsx), asi que tener las dos era redundante
        // (hallazgo 17/Ago/2026). Unificado en una sola entrada.
        { label: "Auditoría", href: "/admin/reportes", icon: ClipboardList },
        { label: "Organización", href: "/admin/organizacion", icon: Building2 },
      ],
    });
  } else if (session?.role_keys.includes("AUDITOR")) {
    items.push({
      label: "Auditar",
      href: AUDITAR_ITEM.href,
      icon: ScrollText,
      enabled: true,
      children: [AUDITAR_ITEM],
    });
  } else if (tieneAccesoIam(session)) {
    // Solo "iam.leer" (casi todos los roles lo traen) sin escritura: mismo
    // apartado que arriba, pero sin Auditar (eso sigue siendo exclusivo de
    // AUDITOR) - cada pantalla adentro ya deja los botones de
    // crear/editar/otorgar deshabilitados por si mismos (ver
    // puedeAdministrarIam en cada pantalla), asi que reusarlas aqui no
    // requiere logica nueva, solo dejarlas entrar (decision de producto
    // 11/Ago/2026: mejor reusar Admin(IAM) en solo-lectura que construir
    // una pantalla de directorio aparte para este caso). Nombre distinto a
    // proposito ("Administración (solo lectura)", no "Admin (IAM)") - con
    // la misma etiqueta se veia identico al menu completo y confundia a
    // quien solo puede ver (hallazgo 11/Ago/2026, PLD_ANALISTA).
    items.push({
      label: "Administración (solo lectura)",
      href: "/admin/usuarios",
      icon: ShieldCheck,
      enabled: true,
      children: [
        { label: "Usuarios", href: "/admin/usuarios", icon: UserRound },
        { label: "Invitaciones", href: "/admin/invitaciones", icon: UserPlus },
        { label: "Permisos", href: "/admin/permisos", icon: KeyRound },
        { label: "Organización", href: "/admin/organizacion", icon: Building2 },
      ],
    });
  }

  if (tieneAccesoPld(session)) {
    items.push({
      label: etiquetaPld(session),
      href: "/pld",
      icon: FileSearch,
      enabled: true,
      children: [
        { label: "Expedientes KYC", href: "/pld", icon: FileSearch },
        { label: "Tickets de cliente", href: "/pld/tickets", icon: Link2 },
      ],
    });
  }

  // Modulos sin construir todavia (Fase 3/4) - se muestran (y se puede
  // entrar, la pantalla dice "en desarrollo" - ver EnDesarrolloPage.tsx)
  // solo a quien SI tiene algun permiso de ese dominio en la matriz
  // (roles-y-permisos.md sec. 3); a quien no le toca nada ahi, se le quita
  // de la barra en vez de dejarlo en gris sin motivo (decision 11/Ago/2026
  // - antes se mostraban los 3 a cualquiera con sesion, y despues se
  // dejaron deshabilitados; version actual permite entrar, ver mas abajo).
  // Contrapartes: permiso ya asignado en la matriz (varios roles PLD lo
  // traen, ej. PLD_APROBADOR/PLD_ANALISTA) pero el "contrapartes-service"
  // (dueno real de id_contraparte, ver comentario en pld/models.py) todavia
  // no existe. Decision de producto 11/Ago/2026: en vez de dejarlo
  // deshabilitado, se deja entrar - la pantalla misma dice "en desarrollo"
  // (mismo criterio que Ventas/Compras/RRHH de aqui abajo y que MiCumbres
  // desde Fase 0) - ver docs/CumbresBI_estado.md Fase 2.
  if (tieneAlgunPermiso(session, ["contrapartes"])) {
    items.push({ label: "Contrapartes", href: "/contrapartes", icon: Users, enabled: true });
  }
  if (tieneAlgunPermiso(session, ["ventas-vivienda", "materiales"])) {
    items.push({ label: "Ventas / Vivienda", href: "/ventas-vivienda", icon: Building2, enabled: true });
  }
  if (tieneAlgunPermiso(session, ["tesoreria", "compras", "facturacion-cfdi"])) {
    items.push({ label: "Compras / Tesorería", href: "/compras-tesoreria", icon: Landmark, enabled: true });
  }
  if (tieneAlgunPermiso(session, ["rrhh"])) {
    items.push({ label: "RRHH y Talento", href: "/rrhh", icon: Users, enabled: true });
  }
  // Hallazgo de AppShell.test.ts (11/Ago/2026, ver docs/CumbresBI_estado.md):
  // estos dos prefijos no tenian apartado dueno todavia - se agregan aqui
  // con el mismo patron "en desarrollo" (TICKETS_RESPONSABLE/
  // TICKETS_PARTICIPANTE/EMPLEADO_SELF para tickets; FINANZAS_MANAGER/
  // CONTRALOR para rentas).
  if (tieneAlgunPermiso(session, ["tickets"])) {
    items.push({ label: "Tickets", href: "/tickets", icon: Link2, enabled: true });
  }
  if (tieneAlgunPermiso(session, ["rentas"])) {
    items.push({ label: "Rentas", href: "/rentas", icon: Landmark, enabled: true });
  }
  items.push({ label: "MiCumbres (portal empleado)", href: "/micumbres", icon: UserRound, enabled: true });
  return items;
}

// Evento global (no Context) para que cualquier pantalla pida un refresco
// del aviso de "usuarios sin rol asignado" de la campana (ej. el
// directorio de usuarios, justo despues de asignar un rol). NO se puede
// usar React Context aqui: cada pagina hace `return <AppShell>...</AppShell>`,
// asi que la propia pagina es ANCESTRO de AppShell (y de cualquier
// Provider que viva dentro de el), nunca su descendiente - un
// useContext() en la pagina siempre veria el valor por defecto, sin
// importar el timing. Un evento de window no depende de la posicion en el
// arbol de componentes.
export const SIN_ROL_CHANGED_EVENT = "cumbresbi:sin-rol-changed";

export function notifySinRolChanged() {
  window.dispatchEvent(new Event(SIN_ROL_CHANGED_EVENT));
}

// Un item con "children" empieza abierto si la ruta actual es uno de sus
// sub-items (ej. entrar directo a /admin/permisos desde un link externo
// debe abrir el submenu de Admin, no dejarlo colapsado con la seccion
// activa escondida adentro).
function NavItemConChildren({
  item,
  pathname,
  onNavigate,
}: {
  item: NavParent;
  pathname: string;
  onNavigate?: () => void;
}) {
  const activo = item.children.some((child) => pathname === child.href);
  const [abierto, setAbierto] = useState(activo);

  return (
    // Contenedor unico (boton + lista desplegada) que se oscurece solo
    // cuando la pagina actual pertenece a esta seccion (activo) - no cada
    // vez que se despliega con un clic. Separado del highlight de "este es
    // el hijo activo" de abajo (que usa un overlay claro, no oscuro).
    <Box sx={{ bgcolor: activo ? "rgba(0,0,0,0.2)" : "transparent", borderRadius: 1 }}>
      <ListItemButton onClick={() => setAbierto((v) => !v)} sx={{ borderRadius: 1, color: "inherit" }}>
        <ListItemIcon sx={{ minWidth: 36, color: "inherit" }}>
          <item.icon size={18} strokeWidth={1.5} />
        </ListItemIcon>
        <ListItemText primary={item.label} primaryTypographyProps={{ fontSize: 13 }} />
        {abierto ? (
          <ChevronDown size={16} strokeWidth={1.5} />
        ) : (
          <ChevronRight size={16} strokeWidth={1.5} />
        )}
      </ListItemButton>
      <Collapse in={abierto} timeout="auto" unmountOnExit>
        <List component="div" disablePadding>
          {item.children.map((child) => (
            <ListItemButton
              key={child.href}
              component="a"
              href={child.href}
              selected={pathname === child.href}
              onClick={onNavigate}
              sx={{
                borderRadius: 1,
                color: "inherit",
                pl: 3,
                "&.Mui-selected": { bgcolor: "rgba(255,255,255,0.12)" },
                "&.Mui-selected:hover": { bgcolor: "rgba(255,255,255,0.18)" },
              }}
            >
              <ListItemIcon sx={{ minWidth: 36, color: "inherit" }}>
                <child.icon size={16} strokeWidth={1.5} />
              </ListItemIcon>
              <ListItemText primary={child.label} primaryTypographyProps={{ fontSize: 13 }} />
            </ListItemButton>
          ))}
        </List>
      </Collapse>
    </Box>
  );
}

function NavList({ session, onNavigate }: { session: SessionUser | null; onNavigate?: () => void }) {
  const pathname = usePathname();
  const navItems = buildNavItems(session);

  return (
    <>
      <Stack direction="row" spacing={1} alignItems="center" sx={{ p: 2 }}>
        <LayoutDashboard size={20} strokeWidth={1.5} />
        <Typography variant="subtitle1" fontWeight={600}>
          CumbresBI
        </Typography>
      </Stack>
      <List sx={{ px: 1 }}>
        {navItems.map((item) =>
          "children" in item ? (
            <NavItemConChildren key={item.label} item={item} pathname={pathname} onNavigate={onNavigate} />
          ) : (
            <ListItemButton
              key={item.label}
              component="a"
              href={item.enabled ? item.href : undefined}
              disabled={!item.enabled}
              selected={pathname === item.href}
              onClick={onNavigate}
              sx={{
                borderRadius: 1,
                color: "inherit",
                "&.Mui-disabled": { opacity: 0.45 },
                "&.Mui-selected": { bgcolor: "rgba(255,255,255,0.12)" },
                "&.Mui-selected:hover": { bgcolor: "rgba(255,255,255,0.18)" },
              }}
            >
              <ListItemIcon sx={{ minWidth: 36, color: "inherit" }}>
                <item.icon size={18} strokeWidth={1.5} />
              </ListItemIcon>
              <ListItemText primary={item.label} primaryTypographyProps={{ fontSize: 13 }} />
            </ListItemButton>
          )
        )}
      </List>
    </>
  );
}

// Header superior - persistente en desktop y movil (antes solo existia en
// movil, como barra del boton hamburguesa). Usuario sigue siendo
// placeholder visual (login es sesion simulada, ver src/lib/auth.ts).
// Notificaciones: aviso de "usuarios sin rol asignado" (decision de
// producto - acceso via login libre, no invitacion formal; ver memoria de
// sesion "iam-invitacion-alcance-incierto"), unico tipo de notificacion
// real por ahora.
function Header({
  onMenuClick,
  isMobile,
  sinRolUsers,
  onVerTodos,
  session,
}: {
  onMenuClick: () => void;
  isMobile: boolean;
  sinRolUsers: IamUser[];
  onVerTodos: () => void;
  session: SessionUser | null;
}) {
  const [anchorEl, setAnchorEl] = useState<HTMLElement | null>(null);
  const [avatarAnchorEl, setAvatarAnchorEl] = useState<HTMLElement | null>(null);
  const count = sinRolUsers.length;

  return (
    <AppBar
      position="fixed"
      elevation={0}
      sx={{
        bgcolor: "background.paper",
        color: "text.primary",
        borderBottom: "1px solid",
        borderColor: "divider",
        zIndex: (t) => t.zIndex.drawer + 1,
        ...(isMobile ? {} : { ml: `${DRAWER_WIDTH}px`, width: `calc(100% - ${DRAWER_WIDTH}px)` }),
      }}
    >
      <Toolbar sx={{ minHeight: HEADER_HEIGHT, gap: 1 }}>
        {isMobile && (
          <IconButton edge="start" aria-label="Abrir menú" onClick={onMenuClick} sx={{ mr: 1 }}>
            <MenuIcon size={20} strokeWidth={1.5} />
          </IconButton>
        )}
        <Box sx={{ flex: 1 }} />
        <IconButton
          aria-label={count > 0 ? `${count} usuario(s) sin rol asignado` : "Notificaciones"}
          size="small"
          onClick={(e) => setAnchorEl(e.currentTarget)}
        >
          <Badge badgeContent={count} color="error" invisible={count === 0}>
            <Bell size={18} strokeWidth={1.5} />
          </Badge>
        </IconButton>
        <Menu anchorEl={anchorEl} open={!!anchorEl} onClose={() => setAnchorEl(null)}>
          {count === 0 ? (
            <MenuItem disabled>Sin notificaciones</MenuItem>
          ) : (
            [
              <MenuItem key="titulo" disabled sx={{ opacity: "1 !important" }}>
                <Typography variant="caption" fontWeight={600} color="text.primary">
                  {count} usuario(s) sin rol asignado
                </Typography>
              </MenuItem>,
              // Clic directo en el usuario (17/Ago/2026, pedido de Mariana) -
              // antes solo estaban listados (disabled) y habia que usar
              // "Ver todos en el directorio" incluso para ver a uno solo.
              ...sinRolUsers.slice(0, 5).map((user) => (
                <MenuItem
                  key={user.user_id}
                  component="a"
                  href={`/admin/usuarios?search=${encodeURIComponent(user.primary_email)}`}
                  onClick={() => setAnchorEl(null)}
                >
                  {user.display_name || user.primary_email}
                </MenuItem>
              )),
              <Divider key="divider" />,
              <MenuItem
                key="ver-todos"
                onClick={() => {
                  setAnchorEl(null);
                  onVerTodos();
                }}
              >
                Ver todos en el directorio
              </MenuItem>,
            ]
          )}
        </Menu>
        <IconButton
          aria-label="Cuenta"
          size="small"
          onClick={(e) => setAvatarAnchorEl(e.currentTarget)}
        >
          <Avatar
            src={session?.picture_url ?? undefined}
            sx={{ width: 30, height: 30, bgcolor: "primary.main", fontSize: 13 }}
          >
            {session?.email ? session.email[0].toUpperCase() : "U"}
          </Avatar>
        </IconButton>
        {/* Solo muestra correo + rol(es) activos, sin "Cerrar sesion" a
        proposito (SSO silencioso, decision de producto): con Google activo
        el logout de CumbresBI no cierra nada de verdad, solo confunde. Los
        roles se agregan aqui (11/Ago/2026) para saber de un vistazo con
        cual sesion se esta probando, sin tener que consultar la BD. */}
        <Menu anchorEl={avatarAnchorEl} open={Boolean(avatarAnchorEl)} onClose={() => setAvatarAnchorEl(null)}>
          <MenuItem disabled sx={{ opacity: 1 }}>
            <Stack spacing={0.75}>
              <Typography variant="body2" fontWeight={600} sx={{ color: "#000" }}>
                {session?.email ?? "—"}
              </Typography>
              {session?.role_keys.length ? (
                <Stack direction="row" spacing={0.5} flexWrap="wrap" useFlexGap>
                  {session.role_keys.map((key) => (
                    <Chip key={key} size="small" label={ROLE_LABELS[key] ?? key} sx={{ color: "#000" }} />
                  ))}
                </Stack>
              ) : (
                <Typography variant="caption" sx={{ color: "#000" }}>
                  Sin rol asignado
                </Typography>
              )}
            </Stack>
          </MenuItem>
          <Divider />
          {/* Acceso directo a MiCumbres desde la carita de perfil
          (17/Ago/2026, pedido de Mariana) - todos los usuarios con sesion
          ven este item, MiCumbres siempre esta en el sidebar tambien (ver
          buildNavItems, ultimo item) - esto es solo un atajo. */}
          <MenuItem component="a" href="/micumbres" onClick={() => setAvatarAnchorEl(null)}>
            Ir a Mi Cumbres
          </MenuItem>
        </Menu>
      </Toolbar>
    </AppBar>
  );
}


// Guard de sesion real (Fase 1, Semana 4; ver src/lib/auth.ts - cookie
// HttpOnly emitida por iam-service tras el login OIDC). Vive en AppShell
// porque todas las paginas autenticadas ya lo envuelven; /login es la
// unica ruta publica y no usa este componente.
export default function AppShell({ children }: { children: React.ReactNode }) {
  const theme = useTheme();
  const isMobile = useMediaQuery(theme.breakpoints.down("md"));
  const [mobileOpen, setMobileOpen] = useState(false);
  const router = useRouter();
  const [checked, setChecked] = useState(false);
  const [session, setSession] = useState<SessionUser | null>(null);
  const [sinRolUsers, setSinRolUsers] = useState<IamUser[]>([]);

  useEffect(() => {
    getSession().then((session) => {
      if (!session) {
        router.replace("/login");
      } else {
        setSession(session);
        setChecked(true);
      }
    });
  }, [router]);

  // Aviso de "usuarios sin rol asignado" (ver Header arriba) - se consulta
  // al cargar el shell y cada vez que se dispare SIN_ROL_CHANGED_EVENT
  // (ver notifySinRolChanged, llamado desde admin/usuarios/page.tsx tras
  // asignar/revocar un rol).
  useEffect(() => {
    if (!checked) return;
    function refreshSinRolUsers() {
      listUsers({ sinRol: true })
        .then(setSinRolUsers)
        .catch(() => undefined);
    }
    refreshSinRolUsers();
    window.addEventListener(SIN_ROL_CHANGED_EVENT, refreshSinRolUsers);
    return () => window.removeEventListener(SIN_ROL_CHANGED_EVENT, refreshSinRolUsers);
  }, [checked]);

  if (!checked) {
    return null;
  }

  const sidebarSx = {
    width: DRAWER_WIDTH,
    bgcolor: BRAND.charcoal,
    color: "common.white",
    "& .MuiDrawer-paper": {
      width: DRAWER_WIDTH,
      bgcolor: BRAND.charcoal,
      color: "common.white",
      boxSizing: "border-box",
    },
  };

  return (
    <Box sx={{ display: "flex", minHeight: "100vh" }}>
      <Header
        onMenuClick={() => setMobileOpen(true)}
        isMobile={isMobile}
        sinRolUsers={sinRolUsers}
        onVerTodos={() => router.push("/admin/usuarios?sinRol=true")}
        session={session}
      />

      {isMobile ? (
        <Drawer
          variant="temporary"
          open={mobileOpen}
          onClose={() => setMobileOpen(false)}
          ModalProps={{ keepMounted: true }}
          sx={sidebarSx}
        >
          <NavList session={session} onNavigate={() => setMobileOpen(false)} />
        </Drawer>
      ) : (
        <Drawer variant="permanent" sx={sidebarSx}>
          <NavList session={session} />
        </Drawer>
      )}

      <Box
        sx={{
          flex: 1,
          minWidth: 0,
          display: "flex",
          flexDirection: "column",
          mt: `${HEADER_HEIGHT}px`,
        }}
      >
        <Box
          component="main"
          sx={{
            flex: 1,
            bgcolor: "background.default",
            p: { xs: 2, sm: 3, md: 4 },
          }}
        >
          {children}
        </Box>
        <Footer />
      </Box>
    </Box>
  );
}
