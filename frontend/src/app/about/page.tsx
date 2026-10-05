"use client";

import { Box, Button, Container, Divider, Link, Paper, Stack, Typography } from "@mui/material";
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
    <Box sx={{ display: "flex", flexDirection: "column", minHeight: "100vh" }}>
      <PublicNavbar />
      <Container maxWidth="md" sx={{ flex: 1, py: 6 }}>
        <Stack spacing={4}>
          <Box>
            <Typography variant="h4" fontWeight={700} gutterBottom>
              CumbresBI — Plataforma de Gestión Empresarial Interna
            </Typography>
            <Typography variant="body1" color="text.secondary">
              CumbresBI es una plataforma digital interna desarrollada por{" "}
              <strong>Consultoría y Proyectos Cumbres S.A. de C.V.</strong> y sus sociedades
              relacionadas (Tizara y Tizara Capital) para la operación y gestión integral de sus
              áreas corporativas.
            </Typography>
          </Box>

          <Box>
            <Typography variant="h6" fontWeight={600} gutterBottom>
              ¿Para qué sirve CumbresBI?
            </Typography>
            <Typography variant="body1">
              CumbresBI centraliza la operación financiera, de obra, compras, recursos humanos y
              cumplimiento regulatorio en una sola plataforma interna. Su uso está restringido
              exclusivamente a colaboradores y personal autorizado de la organización.
            </Typography>
          </Box>

          <Box>
            <Typography variant="h6" fontWeight={600} gutterBottom>
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
                <Paper key={m.titulo} variant="outlined" sx={{ p: 2.5 }}>
                  <Stack direction="row" spacing={1.5} alignItems="flex-start">
                    <Box sx={{ color: "primary.main", mt: 0.25, flexShrink: 0 }}>{m.icon}</Box>
                    <Box>
                      <Typography variant="subtitle2" fontWeight={600}>
                        {m.titulo}
                      </Typography>
                      <Typography variant="body2" color="text.secondary">
                        {m.descripcion}
                      </Typography>
                    </Box>
                  </Stack>
                </Paper>
              ))}
            </Box>
          </Box>

          <Box>
            <Typography variant="h6" fontWeight={600} gutterBottom>
              Integración con Google
            </Typography>
            <Typography variant="body1">
              CumbresBI utiliza las APIs de Google (Google Sheets y Google Drive) exclusivamente
              para permitir a los usuarios autorizados exportar reportes financieros a su propio
              Google Drive. Esta funcionalidad requiere autorización explícita del usuario vía
              OAuth y no concede acceso a ningún archivo preexistente en su cuenta. El uso de datos
              de Google se adhiere a la{" "}
              <em>Google API Services User Data Policy</em> y a los requisitos de uso limitado
              (<em>Limited Use</em>).
            </Typography>
          </Box>

          <Divider />

          <Stack direction="row" spacing={2} flexWrap="wrap">
            <Button variant="outlined" size="small" href="/privacidad">
              Política de Privacidad
            </Button>
            <Button variant="outlined" size="small" href="/terminos">
              Términos y Condiciones
            </Button>
            <Typography variant="body2" color="text.secondary" sx={{ alignSelf: "center" }}>
              Contacto:{" "}
              <Link href="mailto:desarrollo@cypcumbres.com">desarrollo@cypcumbres.com</Link>
            </Typography>
          </Stack>
        </Stack>
      </Container>
      <Footer />
    </Box>
  );
}
