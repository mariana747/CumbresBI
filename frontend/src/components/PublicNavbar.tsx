import { Box, Typography } from "@mui/material";
import { LayoutDashboard } from "lucide-react";
import { BRAND } from "@/theme/theme";

// Navbar de paginas publicas (sin AppShell/sidebar - login, magic-link):
// solo el logo, sin menu ni notificaciones (esas si viven en AppShell,
// para usuarios ya autenticados). Contraparte del Footer global
// (components/Footer.tsx), mismo criterio de altura fija.
export const PUBLIC_NAVBAR_HEIGHT = 56;

export function PublicNavbar() {
  return (
    <Box
      component="header"
      sx={{
        height: PUBLIC_NAVBAR_HEIGHT,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        gap: 1,
        borderBottom: "1px solid",
        borderColor: "divider",
        bgcolor: "background.paper",
      }}
    >
      <LayoutDashboard size={22} strokeWidth={1.5} color={BRAND.azul} />
      <Typography variant="subtitle1" fontWeight={600}>
        CumbresBI
      </Typography>
    </Box>
  );
}
