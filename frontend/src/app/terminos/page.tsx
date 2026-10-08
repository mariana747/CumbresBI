"use client";

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
              <Typography variant="body1" paragraph>
                1.1. <strong>CumbresBI</strong> es una plataforma digital interna de uso exclusivo
                para colaboradores, colaboradoras y personal autorizado de{" "}
                <strong>Consultoría y Proyectos Cumbres S.A. de C.V.</strong> y sus sociedades
                relacionadas (tales como Tizara y Tizara Capital).
              </Typography>
              <Typography variant="body1" paragraph>
                1.2. La plataforma no está abierta ni disponible para el público en general.
              </Typography>
              <Typography variant="body1" paragraph>
                1.3. El acceso está estrictamente restringido a cuentas de correo electrónico
                organizacionales autorizadas.
              </Typography>
              <Typography variant="body1">
                1.4. Cada usuario es legal y administrativamente responsable de la información que
                captura, procesa o consulta, así como del mantenimiento y la confidencialidad de sus
                credenciales de acceso.
              </Typography>
            </Box>

            <Box>
              <Typography variant="h6" fontWeight={600} gutterBottom>
                2. Módulos y Funcionalidades de la Plataforma
              </Typography>
              <Typography variant="body1" paragraph>
                2.1. CumbresBI está destinada a la gestión y operación interna de las siguientes
                áreas corporativas:
              </Typography>
              <Typography variant="body1" component="ul" sx={{ pl: 3 }}>
                <li>
                  <strong>Tesorería</strong> (gestión de flujos, facturas, conciliación bancaria y
                  reportes financieros).
                </li>
                <li>
                  <strong>Control de Obra y Materiales.</strong>
                </li>
                <li>
                  <strong>Gestión de Compras y Proveedores.</strong>
                </li>
                <li>
                  <strong>Recursos Humanos (RRHH).</strong>
                </li>
                <li>
                  <strong>Prevención de Lavado de Dinero (PLD)</strong> y cumplimiento regulatorio.
                </li>
              </Typography>
            </Box>

            <Box>
              <Typography variant="h6" fontWeight={600} gutterBottom>
                3. Integración con Servicios de Google (Google Sheets API y Google Drive)
              </Typography>
              <Typography variant="body1" paragraph>
                3.1. <strong>Función de Exportación:</strong> CumbresBI incorpora la funcionalidad
                opcional <em>"Exportar a Google Sheets"</em> dentro del módulo de Tesorería, la cual
                permite a los usuarios transferir reportes financieros a su suite de Google.
              </Typography>
              <Typography variant="body1" paragraph>
                3.2. <strong>Permisos Requeridos:</strong> Para ejecutar dicha exportación, la
                plataforma solicita autorización explícita del usuario a través de OAuth para dos
                permisos específicos:
              </Typography>
              <Typography variant="body1" component="ul" sx={{ pl: 3 }}>
                <li>
                  <strong>Google Sheets API:</strong> Utilizado exclusivamente para crear y escribir
                  hojas de cálculo con la información seleccionada por el usuario (Flujos de
                  efectivo, Facturas, Conciliación bancaria).
                </li>
                <li>
                  <strong>Google Drive API (archivos creados por la app):</strong> Permite guardar
                  las hojas de cálculo generadas únicamente dentro de una carpeta seleccionada por
                  el usuario en su Drive personal u organizacional. Este permiso se limita
                  estrictamente a los archivos creados por CumbresBI y{" "}
                  <strong>no concede acceso</strong> a ningún otro archivo ni carpeta existente en
                  el Google Drive del usuario.
                </li>
              </Typography>
              <Typography variant="body1" paragraph sx={{ mt: 1 }}>
                3.3. <strong>Almacenamiento y Tratamiento de Tokens OAuth:</strong> Los datos
                exportados se transfieren directamente a la hoja de Google Sheets del usuario.
                CumbresBI no almacena copias de respaldo de las hojas de cálculo exportadas ni
                comercializa dicha información. El token de acceso OAuth otorgado por el usuario se
                almacena de forma <strong>cifrada</strong> en la infraestructura de CumbresBI con el
                único propósito de permitir re-exportaciones subsecuentes a solicitud del usuario.
              </Typography>
              <Typography variant="body1">
                3.4. <strong>Mecanismo de Revocación del Acceso de Google:</strong> El usuario puede
                revocar en cualquier momento el acceso de CumbresBI a su cuenta de Google ingresando
                a{" "}
                <Link
                  href="https://myaccount.google.com/permissions"
                  target="_blank"
                  rel="noopener"
                >
                  myaccount.google.com/permissions
                </Link>
                . Asimismo, puede solicitar a los administradores del sistema la eliminación
                inmediata de su token de acceso registrado en CumbresBI.
              </Typography>
            </Box>

            <Box>
              <Typography variant="h6" fontWeight={600} gutterBottom>
                4. Propiedad Intelectual y Confidencialidad
              </Typography>
              <Typography variant="body1" paragraph>
                4.1. Todos los derechos de propiedad intelectual sobre el código fuente, diseño,
                marcas, logotipos, bases de datos y estructura de CumbresBI son propiedad exclusiva
                de Consultoría y Proyectos Cumbres S.A. de C.V.
              </Typography>
              <Typography variant="body1">
                4.2. Toda la información financiera, de obra, corporativa y de personal procesada
                dentro de CumbresBI tiene carácter de estrictamente confidencial.
              </Typography>
            </Box>

            <Box>
              <Typography variant="h6" fontWeight={600} gutterBottom>
                5. Contacto
              </Typography>
              <Typography variant="body1">
                Dudas sobre estas condiciones:{" "}
                <Link href="mailto:desarrollo@cypcumbres.com">desarrollo@cypcumbres.com</Link>. Ver
                también la <Link href="/privacidad">Política de Privacidad</Link>.
              </Typography>
            </Box>
          </Stack>
        </Paper>
      </Container>
      <Footer />
    </Box>
  );
}
