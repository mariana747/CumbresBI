import { Box, Container, Link, Paper, Stack, Typography } from "@mui/material";
import { Footer } from "@/components/Footer";
import { PublicNavbar } from "@/components/PublicNavbar";

// Pagina publica requerida por Google OAuth consent screen junto con
// /privacidad (ver PUBLIC_PATH_PREFIXES en middleware.ts).
export default function TerminosPage() {
  return (
    <Box sx={{ display: "flex", flexDirection: "column", minHeight: "100vh" }}>
      <PublicNavbar />
      <Container maxWidth="md" sx={{ flex: 1, py: 6 }}>
        <Paper sx={{ p: 4 }}>
          <Stack spacing={3}>
            <Box>
              <Typography variant="h4" fontWeight={700} gutterBottom>
                Condiciones del Servicio — CumbresBI
              </Typography>
              <Typography variant="body2" color="text.secondary">
                Última actualización: 21 de septiembre de 2026
              </Typography>
            </Box>

            <Typography variant="body1">
              CumbresBI es una plataforma interna de uso exclusivo para colaboradores y
              colaboradoras de Cumbres Consultoría y Proyectos y sociedades relacionadas (Tizara,
              Tizara Capital). No está disponible para el público general.
            </Typography>

            <Box>
              <Typography variant="h6" fontWeight={600} gutterBottom>
                1. Uso permitido
              </Typography>
              <Typography variant="body1">
                El acceso está restringido a cuentas de correo autorizadas por la organización. Cada
                usuario es responsable de la información que captura y de mantener su acceso
                personal.
              </Typography>
            </Box>

            <Box>
              <Typography variant="h6" fontWeight={600} gutterBottom>
                2. Integración con Google
              </Typography>
              <Typography variant="body1">
                La función "Exportar a Google Sheets" de Tesorería usa tu cuenta personal de Google
                bajo tu autorización explícita, según se describe en la{" "}
                <Link href="/privacidad">Política de Privacidad</Link>. Puedes revocar ese acceso en
                cualquier momento.
              </Typography>
            </Box>

            <Box>
              <Typography variant="h6" fontWeight={600} gutterBottom>
                3. Contacto
              </Typography>
              <Typography variant="body1">
                Dudas sobre estas condiciones:{" "}
                <Link href="mailto:desarrollo@cypcumbres.com">desarrollo@cypcumbres.com</Link>.
              </Typography>
            </Box>
          </Stack>
        </Paper>
      </Container>
      <Footer />
    </Box>
  );
}
