"use client";

import { Box, Container, Divider, Link, Paper, Stack, Typography } from "@mui/material";
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
                Última actualización: 25 de septiembre de 2026
              </Typography>
              <Typography variant="body2" color="text.secondary">
                Entidad Responsable: Consultoría y Proyectos Cumbres S.A. de C.V. (y sociedades
                relacionadas: Tizara, Tizara Capital)
              </Typography>
            </Box>

            <Box>
              <Typography variant="h6" fontWeight={600} gutterBottom>
                1. Naturaleza y Uso Permitido
              </Typography>
              <Typography variant="body1" component="ol" sx={{ pl: 3 }}>
                <li><strong>CumbresBI</strong> es una plataforma digital interna de uso exclusivo para colaboradores, colaboradoras y personal autorizado de <strong>Consultoría y Proyectos Cumbres S.A. de C.V.</strong> y sus sociedades relacionadas (Tizara y Tizara Capital).</li>
                <li>La plataforma no está abierta ni disponible para el público en general.</li>
                <li>El acceso está estrictamente restringido a cuentas de correo electrónico organizacionales autorizadas.</li>
                <li>Cada usuario es legal y administrativamente responsable de la información que captura, procesa o consulta, así como del mantenimiento y la confidencialidad de sus credenciales de acceso.</li>
              </Typography>
            </Box>

            <Box>
              <Typography variant="h6" fontWeight={600} gutterBottom>
                2. Módulos y Funcionalidades de la Plataforma
              </Typography>
              <Typography variant="body1" paragraph>
                CumbresBI está destinada a la gestión y operación interna de las siguientes áreas corporativas:
              </Typography>
              <Typography variant="body1" component="ul" sx={{ pl: 3 }}>
                <li><strong>Tesorería</strong> (gestión de flujos, facturas, conciliación bancaria y reportes financieros).</li>
                <li><strong>Control de Obra y Materiales.</strong></li>
                <li><strong>Gestión de Compras y Proveedores.</strong></li>
                <li><strong>Recursos Humanos (RRHH).</strong></li>
                <li><strong>Prevención de Lavado de Dinero (PLD)</strong> y cumplimiento regulatorio.</li>
              </Typography>
            </Box>

            <Box>
              <Typography variant="h6" fontWeight={600} gutterBottom>
                3. Integración con Servicios de Google (Google Sheets API y Google Drive)
              </Typography>
              <Typography variant="body1" component="ol" sx={{ pl: 3 }}>
                <li><strong>Función de Exportación:</strong> CumbresBI incorpora la funcionalidad opcional <em>"Exportar a Google Sheets"</em> dentro del módulo de Tesorería, la cual permite transferir reportes financieros a la suite de Google del usuario.</li>
                <li>
                  <strong>Permisos Requeridos:</strong> Para ejecutar dicha exportación, la plataforma solicita autorización explícita vía OAuth para:
                  <ul>
                    <li><strong>Google Sheets API:</strong> exclusivamente para crear y escribir hojas de cálculo con la información seleccionada por el usuario.</li>
                    <li><strong>Google Drive API (<em>App-created files only</em>):</strong> para guardar las hojas generadas en una carpeta seleccionada por el usuario. Este permiso <strong>no concede acceso</strong> a ningún otro archivo o carpeta existente en el Drive del usuario.</li>
                  </ul>
                </li>
                <li><strong>Almacenamiento de Tokens OAuth:</strong> El token de acceso se almacena cifrado en la infraestructura de CumbresBI únicamente para permitir re-exportaciones a solicitud del usuario. CumbresBI no almacena copias de las hojas exportadas ni comercializa dicha información.</li>
                <li>
                  <strong>Revocación del Acceso:</strong> El usuario puede revocar en cualquier momento el acceso de CumbresBI a su cuenta de Google desde{" "}
                  <Link href="https://myaccount.google.com/permissions" target="_blank" rel="noopener">
                    myaccount.google.com/permissions
                  </Link>{" "}
                  o solicitando la eliminación de su token a los administradores del sistema.
                </li>
              </Typography>
            </Box>

            <Box>
              <Typography variant="h6" fontWeight={600} gutterBottom>
                4. Propiedad Intelectual y Confidencialidad
              </Typography>
              <Typography variant="body1" component="ol" sx={{ pl: 3 }}>
                <li>Todos los derechos de propiedad intelectual sobre el código fuente, diseño, marcas, logotipos, bases de datos y estructura de CumbresBI son propiedad exclusiva de Consultoría y Proyectos Cumbres S.A. de C.V.</li>
                <li>Toda la información financiera, de obra, corporativa y de personal procesada dentro de CumbresBI tiene carácter de estrictamente confidencial.</li>
              </Typography>
            </Box>

            <Divider />

            <Box>
              <Typography variant="body1">
                Para conocer cómo tratamos tus datos personales, consulta nuestra{" "}
                <Link href="/privacidad">Política de Privacidad</Link>.
              </Typography>
              <Typography variant="body1" sx={{ mt: 1 }}>
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
