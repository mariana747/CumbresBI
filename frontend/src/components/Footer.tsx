import { Box, Typography } from "@mui/material";
import { BRAND } from "@/theme/theme";
// Footer global - info de version/estado, sin datos dinamicos todavia.
// Compartido entre AppShell (paginas autenticadas) y las paginas publicas
// (ej. login) que no usan AppShell.
export const FOOTER_HEIGHT = 40;

export function Footer() {
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
        bgcolor: BRAND.charcoal,
      }}
    >
      <Typography variant="caption" sx={{ color: "common.white", opacity: 0.7 }}>
        © 2026 Cumbres Consultoría y Proyectos
      </Typography>
    </Box>
  );
}
