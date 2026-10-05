"use client";

import { Box, Button, Container, Link, Paper, Stack, Typography } from "@mui/material";
import { BarChart3, Building2, ClipboardList, ShieldCheck, ShoppingCart, Users } from "lucide-react";
import { Footer } from "@/components/Footer";
import { PublicNavbar } from "@/components/PublicNavbar";

// Pagina publica requerida por Google OAuth consent screen como "home page"
// de la aplicacion. Google verifica que la URL del home page sea accesible
// sin autenticacion y que describa el proposito de la app.
// Ver PUBLIC_PATH_PREFIXES en middleware.ts.
export default function AboutPage() {
  const modulos = [
    {
      icon: <BarChart3 size={22} strokeWidth={1.5} />,
      titulo: "Tesorería",
      descripcion:
        "Gestión de flujos de efectivo, facturas, conciliación bancaria, nóminas y reportes financieros diarios.",
    },
    {
      icon: <Building2 size={22} strokeWidth={1.5} />,
      titulo: "Obra y Materiales",
      descripcion:
        "Control de avance de obra, cortes semanales, catálogo de conceptos, requisiciones y recepciones de material.",
    },
    {
      icon: <ShoppingCart size={22} strokeWidth={1.5} />,
      titulo: "Compras",
      descripcion:
        "Solicitudes de compra, cotizaciones, órdenes de compra y recepción de mercancía.",
    },
    {
      icon: <Users size={22} strokeWidth={1.5} />,
      titulo: "Recursos Humanos",
      descripcion:
        "Gestión de empleados, puestos, historial de sueldos y portal de autoservicio para colaboradores.",
    },
    {
      icon: <ShieldCheck size={22} strokeWidth={1.5} />,
      titulo: "PLD (Prevención de Lavado de Dinero)",
      descripcion:
        "Expedientes KYC/KYB de clientes y proveedores, motor documental, bitácora de cumplimiento regulatorio.",
    },
    {
      icon: <ClipboardList size={22} strokeWidth={1.5} />,
      titulo: "Tickets y Proyectos",
      descripcion:
        "Seguimiento de proyectos internos, subproyectos, dependencias y log de actividad.",
    },
  ];

  return (
    <Box sx={{ display: "flex", flexDirection: "column", minHeight: "100vh", bgcolor: "background.default" }}>
      <PublicNavbar />

      {/* Hero */}
      <Box sx={{ bgcolor: "background.paper", borderBottom: "1px solid", borderColor: "divider" }}>
        <Container maxWidth="md" sx={{ py: { xs: 6, md: 8 }, textAlign: "center" }}>
          <Typography variant="h4" fontWeight={700} textAlign="center">
            CumbresBI
          </Typography>
          <Typography variant="h6" fontWeight={400} color="text.secondary" textAlign="center" gutterBottom>
            Plataforma de Gestión Empresarial Interna
          </Typography>
          <Typography variant="body1" color="text.secondary" sx={{ maxWidth: 640, textAlign: "center", mx: "auto" }}>
            Plataforma digital interna desarrollada por{" "}
            <strong>Consultoría y Proyectos Cumbres S.A. de C.V.</strong> y sus sociedades
            relacionadas (Tizara y Tizara Capital) para la operación y gestión integral de sus
            áreas corporativas.
          </Typography>
        </Container>
      </Box>

      <Container maxWidth="md" sx={{ flex: 1, py: { xs: 5, md: 7 } }}>
        <Stack spacing={5}>

          {/* ¿Para qué sirve? */}
          <Paper elevation={0} sx={{ p: { xs: 3, md: 4 }, borderRadius: 3, boxShadow: "0 1px 4px rgba(0,0,0,0.06)" }}>
            <Typography variant="h6" fontWeight={600} gutterBottom>
              ¿Para qué sirve CumbresBI?
            </Typography>
            <Typography variant="body1" color="text.secondary">
              CumbresBI centraliza la operación financiera, de obra, compras, recursos humanos y
              cumplimiento regulatorio en una sola plataforma interna. Su uso está restringido
              exclusivamente a colaboradores y personal autorizado de la organización.
            </Typography>
          </Paper>

          {/* Módulos */}
          <Box>
            <Typography variant="h6" fontWeight={600} sx={{ mb: 2.5 }}>
              Módulos principales
            </Typography>
            <Box
              sx={{
                display: "grid",
                gridTemplateColumns: { xs: "1fr", sm: "1fr 1fr" },
                gap: 2,
              }}
            >
              {modulos.map((m) => (
                <Paper
                  key={m.titulo}
                  elevation={0}
                  sx={{
                    p: 3,
                    borderRadius: 3,
                    boxShadow: "0 1px 4px rgba(0,0,0,0.06)",
                    transition: "box-shadow 0.2s",
                    "&:hover": { boxShadow: "0 4px 12px rgba(0,0,0,0.10)" },
                  }}
                >
                  <Stack direction="row" spacing={2} alignItems="flex-start">
                    <Box
                      sx={{
                        color: "primary.main",
                        bgcolor: (t) => `${t.palette.primary.main}18`,
                        borderRadius: 2,
                        p: 1,
                        flexShrink: 0,
                        display: "flex",
                      }}
                    >
                      {m.icon}
                    </Box>
                    <Box>
                      <Typography variant="subtitle2" fontWeight={600}>
                        {m.titulo}
                      </Typography>
                      <Typography variant="body2" color="text.secondary" sx={{ mt: 0.5 }}>
                        {m.descripcion}
                      </Typography>
                    </Box>
                  </Stack>
                </Paper>
              ))}
            </Box>
          </Box>

          {/* Integración Google */}
          <Paper elevation={0} sx={{ p: { xs: 3, md: 4 }, borderRadius: 3, boxShadow: "0 1px 4px rgba(0,0,0,0.06)" }}>
            <Typography variant="h6" fontWeight={600} gutterBottom>
              Integración con Google
            </Typography>
            <Typography variant="body1" color="text.secondary">
              CumbresBI utiliza las APIs de Google (Google Sheets y Google Drive) exclusivamente
              para permitir a los usuarios autorizados exportar reportes financieros a su propio
              Google Drive. Esta funcionalidad requiere autorización explícita del usuario vía
              OAuth y no concede acceso a ningún archivo preexistente en su cuenta. El uso de datos
              de Google se adhiere a la{" "}
              <em>Google API Services User Data Policy</em> y a los requisitos de uso limitado
              (<em>Limited Use</em>).
            </Typography>
          </Paper>

          {/* Contacto y links */}
          <Paper elevation={0} sx={{ p: { xs: 3, md: 4 }, borderRadius: 3, boxShadow: "0 1px 4px rgba(0,0,0,0.06)" }}>
            <Typography variant="h6" fontWeight={600} gutterBottom>
              Contacto y documentos legales
            </Typography>
            <Stack spacing={1.5}>
              <Typography variant="body2" color="text.secondary">
                Para dudas sobre el uso de la plataforma o el tratamiento de datos personales:
              </Typography>
              <Link href="mailto:contacto@cypcumbres.mx" underline="hover" variant="body2">
                contacto@cypcumbres.mx
              </Link>
              <Stack direction="row" spacing={2} flexWrap="wrap" sx={{ pt: 0.5 }}>
                <Button variant="outlined" size="small" href="/privacidad">
                  Política de Privacidad
                </Button>
                <Button variant="outlined" size="small" href="/terminos">
                  Términos y Condiciones
                </Button>
              </Stack>
            </Stack>
          </Paper>

        </Stack>
      </Container>

      <Footer />
    </Box>
  );
}
