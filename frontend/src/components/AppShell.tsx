"use client";

import { Box, Stack, Typography, List, ListItemButton, ListItemIcon, ListItemText } from "@mui/material";
import {
  LayoutDashboard,
  ShieldCheck,
  FileSearch,
  Building2,
  Landmark,
  Users,
} from "lucide-react";

// Catalogo de modulos de negocio en el orden confirmado del Plan de Trabajo
// v2.0 (docs/architecture/README.md sec. 2): Admin -> PLD -> Ventas/Vivienda
// -> Compras/Tesoreria -> RRHH. Ninguno tiene ruta real todavia (Fase 0) -
// href queda en "#" hasta que exista el modulo correspondiente.
const NAV_ITEMS = [
  { label: "Panel", href: "/", icon: LayoutDashboard, enabled: true },
  { label: "Admin (IAM)", href: "#", icon: ShieldCheck, enabled: false },
  { label: "PLD / Cumplimiento", href: "#", icon: FileSearch, enabled: false },
  { label: "Ventas / Vivienda", href: "#", icon: Building2, enabled: false },
  { label: "Compras / Tesorería", href: "#", icon: Landmark, enabled: false },
  { label: "RRHH y Talento", href: "#", icon: Users, enabled: false },
] as const;

export default function AppShell({ children }: { children: React.ReactNode }) {
  return (
    <Stack direction="row" sx={{ minHeight: "100vh" }}>
      <Box
        component="nav"
        sx={{
          width: 240,
          bgcolor: "#343741",
          color: "#fff",
          flexShrink: 0,
          display: "flex",
          flexDirection: "column",
        }}
      >
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
              sx={{
                borderRadius: 1,
                color: "inherit",
                "&.Mui-disabled": { opacity: 0.45 },
              }}
            >
              <ListItemIcon sx={{ minWidth: 36, color: "inherit" }}>
                <Icon size={18} strokeWidth={1.5} />
              </ListItemIcon>
              <ListItemText
                primary={label}
                primaryTypographyProps={{ fontSize: 13 }}
              />
            </ListItemButton>
          ))}
        </List>
      </Box>
      <Box component="main" sx={{ flex: 1, p: 4, bgcolor: "background.default" }}>
        {children}
      </Box>
    </Stack>
  );
}
