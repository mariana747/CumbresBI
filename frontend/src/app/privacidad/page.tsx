"use client";

import { Box, Container, Link, Paper, Stack, Typography } from "@mui/material";
import { Footer } from "@/components/Footer";
import { PublicNavbar } from "@/components/PublicNavbar";

// Pagina publica requerida por Google OAuth consent screen (Sheets/Drive
// desde tesoreria - exportar_sheets) para publicar la app fuera de modo
// "Prueba". Ver PUBLIC_PATH_PREFIXES en middleware.ts.
const CARD_SX = {
  elevation: 0,
  sx: { p: { xs: 3, md: 4 }, borderRadius: 3, boxShadow: "0 1px 4px rgba(0,0,0,0.06)" },
} as const;

export default function PrivacidadPage() {
  return (
    <Box sx={{ display: "flex", flexDirection: "column", minHeight: "100vh", bgcolor: "background.default" }}>
      <PublicNavbar />

      {/* Hero */}
      <Box sx={{ bgcolor: "background.paper", borderBottom: "1px solid", borderColor: "divider" }}>
        <Container maxWidth="md" sx={{ py: { xs: 5, md: 7 } }}>
          <Typography variant="h4" fontWeight={700} gutterBottom>
            Política de Privacidad — CumbresBI
          </Typography>
          <Typography variant="body2" color="text.secondary">
            Última actualización: 25 de septiembre de 2026
          </Typography>
          <Typography variant="body2" color="text.secondary">
            Entidad Responsable: Consultoría y Proyectos Cumbres S.A. de C.V. (y sociedades
            relacionadas: Tizara, Tizara Capital)
          </Typography>
        </Container>
      </Box>

      <Container maxWidth="md" sx={{ flex: 1, py: { xs: 5, md: 7 } }}>
        <Stack spacing={3}>

          <Paper {...CARD_SX}>
            <Typography variant="body1" gutterBottom>
              De conformidad con la <em>Ley Federal de Protección de Datos Personales en Posesión de
              los Particulares</em> (LFPDPPP) y su Reglamento, se informa que la entidad responsable
              del tratamiento de los datos personales es:
            </Typography>
            <Typography variant="body1" component="ul" sx={{ pl: 3, mb: 0 }}>
              <li><strong>Denominación Social:</strong> Consultoría y Proyectos Cumbres S.A. de C.V. (en conjunto con sus filiales y sociedades relacionadas: Tizara S.A.P.I. de C.V., Tizara Capital S.A.P.I. de C.V.).</li>
              <li><strong>Área Responsable:</strong> Departamento de Sistemas y Prevención.</li>
              <li><strong>Correo Electrónico de Contacto:</strong> <Link href="mailto:contacto@cypcumbres.mx">contacto@cypcumbres.mx</Link></li>
            </Typography>
          </Paper>

          <Paper {...CARD_SX}>
            <Typography variant="h6" fontWeight={600} gutterBottom>1. Datos Personales Recabados</Typography>
            <Typography variant="body1" component="ul" sx={{ pl: 3, mb: 0 }}>
              <li><strong>Datos de Identificación y Contacto:</strong> Nombre completo, dirección de correo electrónico institucional o autorizado, puesto y área adscrita.</li>
              <li><strong>Datos de Autenticación y Credenciales:</strong> Dirección IP de conexión, registros de sesión (<em>logs</em>) y tokens de acceso Google OAuth cifrados.</li>
              <li><strong>Datos Operativos:</strong> Registro de operaciones realizadas dentro de los módulos de Tesorería, Obra, Compras, RRHH y PLD.</li>
              <li><strong>Uso de Cookies:</strong> CumbresBI utiliza cookies técnicas y variables de sesión necesarias para mantener la sesión activa y garantizar la seguridad del sitio. El usuario puede configurar su navegador para bloquear cookies, reconociendo que esto podría limitar ciertas funcionalidades.</li>
              <li><strong>Datos Sensibles:</strong> CumbresBI <strong>no recaba ni trata datos personales sensibles</strong> (origen étnico, estado de salud, información genética, creencias religiosas o preferencia sexual).</li>
            </Typography>
          </Paper>

          <Paper {...CARD_SX}>
            <Typography variant="h6" fontWeight={600} gutterBottom>2. Finalidades del Tratamiento</Typography>
            <Typography variant="subtitle2" fontWeight={600} gutterBottom>A) Finalidades Primarias (necesarias para el servicio)</Typography>
            <Typography variant="body1" component="ol" sx={{ pl: 3 }}>
              <li>Gestionar el registro, autenticación y control de acceso de usuarios autorizados.</li>
              <li>Permitir el funcionamiento integral de los módulos de Tesorería, Obra, Compras, RRHH y PLD.</li>
              <li>Ejecutar la exportación de reportes a Google Sheets y Google Drive a solicitud del usuario.</li>
              <li>Brindar soporte técnico y comunicación de actualizaciones del sistema.</li>
              <li>Garantizar la seguridad informática, integridad de los datos y auditoría interna.</li>
            </Typography>
            <Typography variant="subtitle2" fontWeight={600} gutterBottom sx={{ mt: 1 }}>B) Finalidades Secundarias (no esenciales)</Typography>
            <Typography variant="body1" component="ol" sx={{ pl: 3 }}>
              <li>Análisis interno y elaboración de estadísticas de uso para la mejora continua de la plataforma.</li>
            </Typography>
            <Typography variant="body2" color="text.secondary" sx={{ mt: 1 }}>
              Si no deseas que tus datos sean utilizados para finalidades secundarias, escríbenos a{" "}
              <Link href="mailto:contacto@cypcumbres.mx">contacto@cypcumbres.mx</Link>.
            </Typography>
          </Paper>

          <Paper {...CARD_SX}>
            <Typography variant="h6" fontWeight={600} gutterBottom>3. Qué acceso pedimos a tu cuenta de Google</Typography>
            <Typography variant="body1" paragraph>
              Cuando conectas tu cuenta personal de Google desde Tesorería (función "Exportar a
              Google Sheets"), pedimos autorización explícita vía OAuth para dos permisos:
            </Typography>
            <Typography variant="body1" component="ul" sx={{ pl: 3 }}>
              <li><strong>Google Sheets API:</strong> para crear y escribir hojas de cálculo con los datos que tú decides exportar (Flujos, Facturas, Conciliación, etc.).</li>
              <li><strong>Google Drive API (<em>App-created files only</em>):</strong> para guardar esas hojas en una carpeta de tu Drive que tú eliges. Este permiso se limita estrictamente a los archivos creados por CumbresBI y <strong>no concede acceso</strong> a ningún otro archivo existente en tu Drive.</li>
            </Typography>
            <Typography variant="body1" sx={{ mt: 1 }}>
              El token de acceso OAuth se almacena <strong>cifrado</strong> únicamente para permitir
              re-exportaciones a tu solicitud. No almacenamos copias de tus hojas ni las compartimos con terceros.
            </Typography>
          </Paper>

          <Paper {...CARD_SX}>
            <Typography variant="h6" fontWeight={600} gutterBottom>4. Transferencia de Datos y Uso de Datos de Google</Typography>
            <Typography variant="body1" paragraph>
              Consultoría y Proyectos Cumbres S.A. de C.V. <strong>no vende, alquila, transfiere ni
              comparte</strong> datos personales ni información de Google con terceros ajenos a la organización.
            </Typography>
            <Typography variant="body1">
              El acceso, uso, almacenamiento y transferencia de información recibida a través de las
              APIs de Google se adhiere a la{" "}
              <em>Política de Datos del Usuario de los Servicios de API de Google</em> (Google API
              Services User Data Policy), incluyendo los requisitos de uso limitado (<em>Limited Use</em>).
              Dicha información no se utiliza para entrenamiento de modelos de IA ni para fines publicitarios.
            </Typography>
          </Paper>

          <Paper {...CARD_SX}>
            <Typography variant="h6" fontWeight={600} gutterBottom>5. Medidas de Seguridad</Typography>
            <Typography variant="body1" component="ul" sx={{ pl: 3, mb: 0 }}>
              <li>Cifrado de comunicaciones mediante protocolos <strong>SSL/TLS</strong>.</li>
              <li>Almacenamiento cifrado de tokens de autenticación OAuth.</li>
              <li>Controles de acceso basados en roles y privilegios mínimos.</li>
              <li>Infraestructura en servidores seguros con políticas de respaldo periódico.</li>
            </Typography>
          </Paper>

          <Paper {...CARD_SX}>
            <Typography variant="h6" fontWeight={600} gutterBottom>6. Ejercicio de Derechos ARCO y Revocación del Consentimiento</Typography>
            <Typography variant="body1" paragraph>
              Tienes derecho de <strong>Acceso, Rectificación, Cancelación y Oposición</strong> (ARCO)
              sobre tus datos personales. Para ejercerlos:
            </Typography>
            <Typography variant="body1" component="ol" sx={{ pl: 3 }}>
              <li>Envía tu solicitud a <Link href="mailto:contacto@cypcumbres.mx">contacto@cypcumbres.mx</Link>.</li>
              <li>Incluye: nombre completo, correo de contacto, documento de identidad y descripción de los datos sobre los que ejerces el derecho.</li>
              <li>Recibirás respuesta en un máximo de <strong>20 días hábiles</strong>; la medida se ejecutará en los <strong>15 días hábiles</strong> siguientes si es procedente.</li>
            </Typography>
            <Typography variant="body1" sx={{ mt: 1 }}>
              Para revocar el acceso de Google: visita{" "}
              <Link href="https://myaccount.google.com/permissions" target="_blank" rel="noopener">myaccount.google.com/permissions</Link>{" "}
              o solicita a un administrador que elimine tu token desde el sistema.
            </Typography>
            <Typography variant="body2" color="text.secondary" sx={{ mt: 1 }}>
              Si consideras que tu derecho a la protección de datos ha sido vulnerado, puedes acudir
              ante el INAI en{" "}
              <Link href="https://home.inai.org.mx" target="_blank" rel="noopener">home.inai.org.mx</Link>.
            </Typography>
          </Paper>

          <Paper {...CARD_SX}>
            <Typography variant="h6" fontWeight={600} gutterBottom>7. Cambios a esta Política</Typography>
            <Typography variant="body1">
              Este documento puede actualizarse por nuevos requerimientos legales, cambios técnicos
              en la integración con Google o actualizaciones internas. Cualquier modificación se
              notificará en la pantalla principal de CumbresBI o por correo electrónico corporativo.
            </Typography>
          </Paper>

          <Paper {...CARD_SX}>
            <Typography variant="h6" fontWeight={600} gutterBottom>8. Contacto y Jurisdicción</Typography>
            <Typography variant="body1" component="ul" sx={{ pl: 3, mb: 0 }}>
              <li><strong>Contacto:</strong> <Link href="mailto:contacto@cypcumbres.mx">contacto@cypcumbres.mx</Link></li>
              <li><strong>Legislación aplicable:</strong> Leyes Federales de los Estados Unidos Mexicanos (LFPDPPP).</li>
              <li><strong>Jurisdicción:</strong> Tribunales competentes aplicables a la entidad jurídica corporativa.</li>
            </Typography>
          </Paper>

        </Stack>
      </Container>
      <Footer />
    </Box>
  );
}
