"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import {
  AppBar,
  Avatar,
  Badge,
  Box,
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
  FileSearch,
  Building2,
  Landmark,
  Users,
  UserRound,
  Bell,
  Menu as MenuIcon,
} from "lucide-react";
import { isLoggedIn } from "@/lib/auth";
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
const NAV_ITEMS = [
  { label: "Panel", href: "/", icon: LayoutDashboard, enabled: true },
  // Admin (IAM) agrupa Usuarios/Bitacora/Magic Links como pestañas dentro
  // de la pantalla (ver AdminTabs.tsx) - un solo item aqui, no tres, porque
  // son capacidades de IAM, no modulos de negocio propios.
  { label: "Admin (IAM)", href: "/admin/usuarios", icon: ShieldCheck, enabled: true },
  { label: "PLD / Cumplimiento", href: "/pld", icon: FileSearch, enabled: true },
  { label: "Ventas / Vivienda", href: "#", icon: Building2, enabled: false },
  { label: "Compras / Tesorería", href: "#", icon: Landmark, enabled: false },
  { label: "RRHH y Talento", href: "#", icon: Users, enabled: false },
  { label: "MiCumbres (portal empleado)", href: "/micumbres", icon: UserRound, enabled: true },
] as const;

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

function NavList({ onNavigate }: { onNavigate?: () => void }) {
  return (
    <>
      <Stack direction="row" spacing={1} alignItems="center" sx={{ p: 2 }}>
        <LayoutDashboard size={20} strokeWidth={1.5} />
        <Typography variant="subtitle1" fontWeight={600}>
          CumbresBI
        </Typography>
      </Stack>
      <List sx={{ px: 1 }}>
        {NAV_ITEMS.map(({ label, href, icon: Icon, enabled }) => (
          <ListItemButton
            key={label}
            component="a"
            href={enabled ? href : undefined}
            disabled={!enabled}
            onClick={onNavigate}
            sx={{
              borderRadius: 1,
              color: "inherit",
              "&.Mui-disabled": { opacity: 0.45 },
            }}
          >
            <ListItemIcon sx={{ minWidth: 36, color: "inherit" }}>
              <Icon size={18} strokeWidth={1.5} />
            </ListItemIcon>
            <ListItemText primary={label} primaryTypographyProps={{ fontSize: 13 }} />
          </ListItemButton>
        ))}
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
}: {
  onMenuClick: () => void;
  isMobile: boolean;
  sinRolUsers: IamUser[];
  onVerTodos: () => void;
}) {
  const [anchorEl, setAnchorEl] = useState<HTMLElement | null>(null);
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
                <Typography variant="caption" fontWeight={600} color="text.secondary">
                  {count} usuario(s) sin rol asignado
                </Typography>
              </MenuItem>,
              ...sinRolUsers.slice(0, 5).map((user) => (
                <MenuItem key={user.user_id} disabled>
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
        <Avatar sx={{ width: 30, height: 30, bgcolor: "primary.main", fontSize: 13 }}>U</Avatar>
      </Toolbar>
    </AppBar>
  );
}


// Guard de sesion de Fase 0 (ver src/lib/auth.ts - sesion simulada,
// iam-service todavia no emite JWT real). Vive en AppShell porque todas las
// paginas autenticadas ya lo envuelven; /login es la unica ruta publica y no
// usa este componente.
export default function AppShell({ children }: { children: React.ReactNode }) {
  const theme = useTheme();
  const isMobile = useMediaQuery(theme.breakpoints.down("md"));
  const [mobileOpen, setMobileOpen] = useState(false);
  const router = useRouter();
  const [checked, setChecked] = useState(false);
  const [sinRolUsers, setSinRolUsers] = useState<IamUser[]>([]);

  useEffect(() => {
    if (!isLoggedIn()) {
      router.replace("/login");
    } else {
      setChecked(true);
    }
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
      />

      {isMobile ? (
        <Drawer
          variant="temporary"
          open={mobileOpen}
          onClose={() => setMobileOpen(false)}
          ModalProps={{ keepMounted: true }}
          sx={sidebarSx}
        >
          <NavList onNavigate={() => setMobileOpen(false)} />
        </Drawer>
      ) : (
        <Drawer variant="permanent" sx={sidebarSx}>
          <NavList />
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
