"use client";

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
                Política de Privacidad y Aviso de Privacidad Integral — CumbresBI
              </Typography>
              <Typography variant="body2" color="text.secondary">
                Última actualización: 25 de septiembre de 2026
              </Typography>
            </Box>

            <Box>
              <Typography variant="h6" fontWeight={600} gutterBottom>
                1. Identificación del Responsable del Tratamiento
              </Typography>
              <Typography variant="body1" paragraph>
                De conformidad con la <em>Ley Federal de Protección de Datos Personales en Posesión
                de los Particulares</em> (LFPDPPP) y su Reglamento, el responsable del tratamiento
                de los datos personales es:
              </Typography>
              <Typography variant="body1" component="ul" sx={{ pl: 3 }}>
                <li>
                  <strong>Denominación Social:</strong> Consultoría y Proyectos Cumbres S.A. de
                  C.V. (en conjunto con sus filiales: Tizara S.A.P.I. de C.V., Tizara Capital
                  S.A.P.I. de C.V.).
                </li>
                <li>
                  <strong>Área Responsable:</strong> Departamento de Sistemas y Prevención.
                </li>
                <li>
                  <strong>Correo Electrónico de Contacto:</strong>{" "}
                  <Link href="mailto:desarrollo@cypcumbres.com">desarrollo@cypcumbres.com</Link>
                </li>
              </Typography>
            </Box>

            <Box>
              <Typography variant="h6" fontWeight={600} gutterBottom>
                2. Datos Personales Recabados
              </Typography>
              <Typography variant="body1" paragraph>
                CumbresBI recaba únicamente los datos personales necesarios para la operación y
                autenticación dentro de la plataforma interna:
              </Typography>
              <Typography variant="body1" component="ul" sx={{ pl: 3 }}>
                <li>
                  <strong>Datos de Identificación y Contacto:</strong> Nombre completo, dirección de
                  correo electrónico institucional o autorizado, puesto y área adscrita.
                </li>
                <li>
                  <strong>Datos de Autenticación y Credenciales:</strong> Dirección IP de conexión,
                  registros de sesión (<em>logs</em>) y tokens de acceso Google OAuth cifrados.
                </li>
                <li>
                  <strong>Datos Operativos:</strong> Registro de operaciones realizadas dentro de
                  los módulos de Tesorería, Obra, Compras, RRHH y PLD.
                </li>
                <li>
                  <strong>Uso de Cookies:</strong> CumbresBI utiliza cookies técnicas y variables de
                  sesión necesarias para personalizar la experiencia de navegación, mantener la
                  sesión activa y garantizar la seguridad del sitio. El usuario puede configurar su
                  navegador para bloquear cookies, reconociendo que esto podría limitar ciertas
                  funcionalidades.
                </li>
                <li>
                  <strong>Datos Sensibles:</strong> CumbresBI <strong>no recaba ni trata</strong>{" "}
                  datos personales sensibles (origen étnico, estado de salud, información genética,
                  creencias religiosas o preferencia sexual).
                </li>
              </Typography>
            </Box>

            <Box>
              <Typography variant="h6" fontWeight={600} gutterBottom>
                3. Finalidades del Tratamiento
              </Typography>
              <Typography variant="body1" fontWeight={500} gutterBottom>
                A) Finalidades Primarias (necesarias para la relación jurídica y el servicio)
              </Typography>
              <Typography variant="body1" component="ol" sx={{ pl: 3 }}>
                <li>
                  Gestionar el registro, autenticación y control de acceso de usuarios autorizados a
                  CumbresBI.
                </li>
                <li>
                  Permitir el funcionamiento integral de los módulos de Tesorería, Obra, Compras,
                  Recursos Humanos y PLD.
                </li>
                <li>
                  Ejecutar la funcionalidad de exportación de reportes a Google Sheets y Google
                  Drive a solicitud del usuario.
                </li>
                <li>
                  Brindar soporte técnico, atención a incidencias y comunicación de actualizaciones
                  del sistema.
                </li>
                <li>
                  Garantizar la seguridad informática, integridad de los datos y auditoría interna.
                </li>
              </Typography>
              <Typography variant="body1" fontWeight={500} gutterBottom sx={{ mt: 1 }}>
                B) Finalidades Secundarias (no esenciales)
              </Typography>
              <Typography variant="body1" component="ol" sx={{ pl: 3 }}>
                <li>
                  Análisis interno y elaboración de estadísticas de uso para la mejora continua de
                  la plataforma.
                </li>
              </Typography>
              <Typography variant="body2" color="text.secondary" sx={{ mt: 1 }}>
                Si no deseas que tus datos sean tratados para finalidades secundarias, puedes
                manifestar tu negativa enviando un correo a{" "}
                <Link href="mailto:desarrollo@cypcumbres.com">desarrollo@cypcumbres.com</Link>.
              </Typography>
            </Box>

            <Box>
              <Typography variant="h6" fontWeight={600} gutterBottom>
                4. Transferencia de Datos Personales y Uso de Datos de Google
              </Typography>
              <Typography variant="body1" paragraph>
                4.1. <strong>Cláusula de No Transferencia:</strong> Consultoría y Proyectos Cumbres
                S.A. de C.V. <strong>no vende, alquila, transfiere ni comparte</strong> los datos
                personales ni la información de Google de sus usuarios con terceros ajenos a la
                organización.
              </Typography>
              <Typography variant="body1">
                4.2. <strong>Uso de Datos de Google API:</strong> El acceso, uso, almacenamiento y
                transferencia de cualquier información recibida a través de las APIs de Google se
                adhiere estrictamente a la{" "}
                <em>Política de Datos del Usuario de los Servicios de API de Google</em> (Google API
                Services User Data Policy), incluyendo los requisitos de uso limitado (
                <em>Limited Use</em>). Dicha información no se utiliza para entrenamiento de modelos
                de inteligencia artificial ni para fines publicitarios.
              </Typography>
            </Box>

            <Box>
              <Typography variant="h6" fontWeight={600} gutterBottom>
                5. Medidas de Seguridad
              </Typography>
              <Typography variant="body1" paragraph>
                El Responsable implementa medidas de seguridad administrativas, técnicas y físicas
                conforme a los estándares de la LFPDPPP:
              </Typography>
              <Typography variant="body1" component="ul" sx={{ pl: 3 }}>
                <li>Cifrado de comunicaciones mediante protocolos SSL/TLS.</li>
                <li>Almacenamiento cifrado de tokens de autenticación OAuth.</li>
                <li>Controles de acceso basados en roles y privilegios mínimos.</li>
                <li>
                  Resguardo de la infraestructura en servidores seguros con políticas de respaldo
                  periódico.
                </li>
              </Typography>
            </Box>

            <Box>
              <Typography variant="h6" fontWeight={600} gutterBottom>
                6. Procedimiento para el Ejercicio de Derechos ARCO y Revocación del Consentimiento
              </Typography>
              <Typography variant="body1" paragraph>
                El usuario tiene derecho a <strong>Acceso</strong>, <strong>Rectificación</strong>,{" "}
                <strong>Cancelación</strong> y <strong>Oposición</strong> (derechos ARCO) respecto
                de sus datos personales. Para ejercerlos:
              </Typography>
              <Typography variant="body1" component="ol" sx={{ pl: 3 }}>
                <li>
                  Enviar la solicitud a{" "}
                  <Link href="mailto:desarrollo@cypcumbres.com">desarrollo@cypcumbres.com</Link>.
                </li>
                <li>
                  Incluir: nombre completo, correo de contacto, documento de identidad vigente,
                  descripción clara de los datos y el derecho que desea ejercer.
                </li>
                <li>
                  El Responsable responderá en un plazo máximo de <strong>20 días hábiles</strong>{" "}
                  desde la recepción. De ser procedente, la medida se hará efectiva dentro de los{" "}
                  <strong>15 días hábiles</strong> siguientes.
                </li>
                <li>
                  <strong>Instancia de Protección (INAI):</strong> Si consideras que tu derecho a
                  la protección de datos ha sido vulnerado, puedes acudir ante el INAI en{" "}
                  <Link href="https://home.inai.org.mx/" target="_blank" rel="noopener">
                    home.inai.org.mx
                  </Link>
                  .
                </li>
              </Typography>
            </Box>

            <Box>
              <Typography variant="h6" fontWeight={600} gutterBottom>
                7. Cambios a la Política de Privacidad
              </Typography>
              <Typography variant="body1">
                Este documento puede sufrir modificaciones derivadas de nuevos requerimientos
                legales, cambios técnicos en la integración con Google o actualizaciones de las
                políticas internas de CumbresBI. Cualquier modificación será notificada a través de
                un aviso en la pantalla principal de CumbresBI o mediante correo electrónico
                corporativo.
              </Typography>
            </Box>

            <Box>
              <Typography variant="h6" fontWeight={600} gutterBottom>
                8. Contacto y Jurisdicción
              </Typography>
              <Typography variant="body1" component="ul" sx={{ pl: 3 }}>
                <li>
                  <strong>Atención a dudas y solicitudes:</strong>{" "}
                  <Link href="mailto:desarrollo@cypcumbres.com">desarrollo@cypcumbres.com</Link>
                </li>
                <li>
                  <strong>Legislación Aplicable:</strong> Leyes Federales de los Estados Unidos
                  Mexicanos (LFPDPPP).
                </li>
                <li>
                  <strong>Jurisdicción:</strong> Tribunales competentes aplicables a la entidad
                  jurídica corporativa.
                </li>
              </Typography>
            </Box>
          </Stack>
        </Paper>
      </Container>
      <Footer />
    </Box>
  );
}
