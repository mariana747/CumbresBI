"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import {
  AppBar,
  Avatar,
  Badge,
  Box,
  Drawer,
  IconButton,
  List,
  ListItemButton,
  ListItemIcon,
  ListItemText,
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

const DRAWER_WIDTH = 240;
const HEADER_HEIGHT = 56;
const FOOTER_HEIGHT = 32;

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
// movil, como barra del boton hamburguesa). Usuario/notificaciones son
// placeholders visuales: no hay datos reales de usuario todavia (login es
// sesion simulada, ver src/lib/auth.ts) ni backend de notificaciones.
function Header({ onMenuClick, isMobile }: { onMenuClick: () => void; isMobile: boolean }) {
  return (
    <AppBar
      position="fixed"
      elevation={0}
      sx={{
        bgcolor: "#fff",
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
        <IconButton aria-label="Notificaciones" size="small">
          <Badge variant="dot" color="primary" invisible>
            <Bell size={18} strokeWidth={1.5} />
          </Badge>
        </IconButton>
        <Avatar sx={{ width: 30, height: 30, bgcolor: "#1C75BC", fontSize: 13 }}>U</Avatar>
      </Toolbar>
    </AppBar>
  );
}

// Footer inferior - info de version/estado, sin datos dinamicos todavia.
function Footer() {
  return (
    <Box
      component="footer"
      sx={{
        height: FOOTER_HEIGHT,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        borderTop: "1px solid",
        borderColor: "divider",
        bgcolor: "#fff",
      }}
    >
      <Typography variant="caption" color="text.secondary">
        CumbresBI · Fase 0
      </Typography>
    </Box>
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

  useEffect(() => {
    if (!isLoggedIn()) {
      router.replace("/login");
    } else {
      setChecked(true);
    }
  }, [router]);

  if (!checked) {
    return null;
  }

  const sidebarSx = {
    width: DRAWER_WIDTH,
    bgcolor: "#343741",
    color: "#fff",
    "& .MuiDrawer-paper": {
      width: DRAWER_WIDTH,
      bgcolor: "#343741",
      color: "#fff",
      boxSizing: "border-box",
    },
  };

  return (
    <Box sx={{ display: "flex", minHeight: "100vh" }}>
      <Header onMenuClick={() => setMobileOpen(true)} isMobile={isMobile} />

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
