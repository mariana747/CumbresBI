import { Box, Container, Link, Paper, Stack, Typography } from "@mui/material";
import { Footer } from "@/components/Footer";
import { PublicNavbar } from "@/components/PublicNavbar";

// Pagina publica requerida por Google OAuth consent screen (Sheets/Drive
// desde tesoreria - exportar_sheets) para publicar la app fuera de modo
// "Prueba". Ver PUBLIC_PATH_PREFIXES en middleware.ts.
export default function PrivacidadPage() {
  return (
    <Box sx={{ display: "flex", flexDirection: "column", minHeight: "100vh" }}>
      <PublicNavbar />
      <Container maxWidth="md" sx={{ flex: 1, py: 6 }}>
        <Paper sx={{ p: 4 }}>
          <Stack spacing={3}>
            <Box>
              <Typography variant="h4" fontWeight={700} gutterBottom>
                Política de Privacidad — CumbresBI
              </Typography>
              <Typography variant="body2" color="text.secondary">
                Última actualización: 21 de septiembre de 2026
              </Typography>
            </Box>

            <Typography variant="body1">
              CumbresBI es una plataforma interna de Cumbres Consultoría y Proyectos (y sociedades
              relacionadas: Tizara, Tizara Capital) para la gestión de Tesorería, Obra, Materiales,
              Compras, RRHH y PLD.
            </Typography>

            <Box>
              <Typography variant="h6" fontWeight={600} gutterBottom>
                1. Qué acceso pedimos a tu cuenta de Google
              </Typography>
              <Typography variant="body1" paragraph>
                Cuando conectas tu cuenta personal de Google desde Tesorería (función "Exportar a
                Google Sheets"), pedimos dos permisos:
              </Typography>
              <Typography variant="body1" component="ul" sx={{ pl: 3 }}>
                <li>
                  <strong>Google Sheets:</strong> para crear y escribir hojas de cálculo con los
                  datos que tú decides exportar (Flujos, Facturas, Conciliación, etc.).
                </li>
                <li>
                  <strong>Google Drive, solo archivos de la app:</strong> para guardar esas hojas en
                  una carpeta de tu Drive personal que tú eliges. Este permiso no nos da acceso a
                  otros archivos de tu Drive — solo a los que la app misma crea.
                </li>
              </Typography>
            </Box>

            <Box>
              <Typography variant="h6" fontWeight={600} gutterBottom>
                2. Qué hacemos con esos datos
              </Typography>
              <Typography variant="body1" component="ul" sx={{ pl: 3 }}>
                <li>
                  Los datos exportados (Flujos, Facturas, etc.) se escriben directamente en tu hoja
                  de Google Sheets, en tu propio Drive.
                </li>
                <li>No almacenamos copia del contenido de tus hojas de Sheets ni las compartimos con terceros.</li>
                <li>
                  El token de acceso OAuth se guarda cifrado en nuestra plataforma únicamente para
                  poder generar la exportación cuando tú lo solicites de nuevo; puedes revocarlo en
                  cualquier momento desde{" "}
                  <Link href="https://myaccount.google.com/permissions" target="_blank" rel="noopener">
                    myaccount.google.com/permissions
                  </Link>
                  .
                </li>
              </Typography>
            </Box>

            <Box>
              <Typography variant="h6" fontWeight={600} gutterBottom>
                3. Con quién compartimos información
              </Typography>
              <Typography variant="body1">
                No compartimos, vendemos ni transferimos tus datos de Google a ningún tercero. El
                acceso es exclusivamente para el funcionamiento de la exportación dentro de
                CumbresBI.
              </Typography>
            </Box>

            <Box>
              <Typography variant="h6" fontWeight={600} gutterBottom>
                4. Cómo revocar el acceso
              </Typography>
              <Typography variant="body1">
                Puedes desconectar CumbresBI de tu cuenta de Google en cualquier momento desde{" "}
                <Link href="https://myaccount.google.com/permissions" target="_blank" rel="noopener">
                  myaccount.google.com/permissions
                </Link>
                , o solicitando a un administrador que borre tu token desde el sistema.
              </Typography>
            </Box>

            <Box>
              <Typography variant="h6" fontWeight={600} gutterBottom>
                5. Contacto
              </Typography>
              <Typography variant="body1">
                Dudas sobre esta política:{" "}
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
