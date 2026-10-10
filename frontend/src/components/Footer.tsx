import { Box, Link, Typography } from "@mui/material";
import { BRAND } from "@/theme/theme";
// Footer global — compartido entre AppShell (paginas autenticadas) y paginas publicas.
export const FOOTER_HEIGHT = 48;

export function Footer() {
  return (
    <Box
      component="footer"
      sx={{
        height: FOOTER_HEIGHT,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        gap: 2,
        flexWrap: "wrap",
        px: 2,
        borderTop: "1px solid",
        borderColor: "divider",
        bgcolor: BRAND.charcoal,
      }}
    >
      <Typography variant="caption" sx={{ color: "common.white", opacity: 0.7 }}>
        © 2026 Cumbres Consultoría y Proyectos
      </Typography>
      <Link href="/about" variant="caption" sx={{ color: "common.white", opacity: 0.7, textDecorationColor: "rgba(255,255,255,0.4)" }}>
        Acerca de
      </Link>
      <Link href="/privacidad" variant="caption" sx={{ color: "common.white", opacity: 0.7, textDecorationColor: "rgba(255,255,255,0.4)" }}>
        Política de Privacidad
      </Link>
      <Link href="/terminos" variant="caption" sx={{ color: "common.white", opacity: 0.7, textDecorationColor: "rgba(255,255,255,0.4)" }}>
        Términos y Condiciones
      </Link>
      <Link href="mailto:contacto@cypcumbres.mx" variant="caption" sx={{ color: "common.white", opacity: 0.7, textDecorationColor: "rgba(255,255,255,0.4)" }}>
        contacto@cypcumbres.mx
      </Link>
    </Box>
  );
}
