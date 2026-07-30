"use client";

import { useState } from "react";
import {
  AppBar,
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
  Menu as MenuIcon,
} from "lucide-react";

const DRAWER_WIDTH = 240;

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
  { label: "Admin (IAM)", href: "#", icon: ShieldCheck, enabled: false },
  { label: "PLD / Cumplimiento", href: "#", icon: FileSearch, enabled: false },
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

export default function AppShell({ children }: { children: React.ReactNode }) {
  const theme = useTheme();
  const isMobile = useMediaQuery(theme.breakpoints.down("md"));
  const [mobileOpen, setMobileOpen] = useState(false);

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
      {isMobile ? (
        <>
          <AppBar
            position="fixed"
            elevation={0}
            sx={{ bgcolor: "#343741", zIndex: (t) => t.zIndex.drawer + 1 }}
          >
            <Toolbar sx={{ minHeight: 56 }}>
              <IconButton
                edge="start"
                color="inherit"
                aria-label="Abrir menú"
                onClick={() => setMobileOpen(true)}
                sx={{ mr: 1 }}
              >
                <MenuIcon size={20} strokeWidth={1.5} />
              </IconButton>
              <Typography variant="subtitle1" fontWeight={600}>
                CumbresBI
              </Typography>
            </Toolbar>
          </AppBar>
          <Drawer
            variant="temporary"
            open={mobileOpen}
            onClose={() => setMobileOpen(false)}
            ModalProps={{ keepMounted: true }}
            sx={sidebarSx}
          >
            <NavList onNavigate={() => setMobileOpen(false)} />
          </Drawer>
        </>
      ) : (
        <Drawer variant="permanent" sx={sidebarSx}>
          <NavList />
        </Drawer>
      )}

      <Box
        component="main"
        sx={{
          flex: 1,
          minWidth: 0,
          bgcolor: "background.default",
          p: { xs: 2, sm: 3, md: 4 },
          ...(isMobile && { mt: "56px" }),
        }}
      >
        {children}
      </Box>
    </Box>
  );
}
