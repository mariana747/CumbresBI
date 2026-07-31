"use client";

import { Box, Button, Divider, Paper, Stack, TextField, Typography } from "@mui/material";
import { LayoutDashboard, Chrome, Mail } from "lucide-react";

// Pagina publica (sin AppShell / sidebar - el usuario aun no esta
// autenticado). Cero contrasenas: dos vias de entrada, ver
// docs/architecture/README.md sec. 6.
//   - Interna: Google Workspace OIDC (boton, redirige a iam-service cuando
//     exista - hoy sin backend real conectado, Fase 0).
//   - Externa: Magic Link, el usuario pide que le llegue un enlace de un
//     solo uso a su correo (formulario, sin envio real todavia).
// Ninguno de los dos flujos hace una llamada real - es el shell visual de
// la Actividad 1/7 de Semana 1, listo para conectarse a iam-service en Fase 1.
export default function LoginPage() {
  return (
    <Box
      sx={{
        minHeight: "100vh",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        bgcolor: "background.default",
        p: 2,
      }}
    >
      <Paper
        elevation={0}
        sx={{
          p: { xs: 3, sm: 4 },
          width: "100%",
          maxWidth: 380,
          border: "1px solid",
          borderColor: "divider",
        }}
      >
        <Stack spacing={1} alignItems="center" sx={{ mb: 3 }}>
          <LayoutDashboard size={28} strokeWidth={1.5} color="#1C75BC" />
          <Typography variant="h6" fontWeight={600}>
            CumbresBI
          </Typography>
          <Typography variant="body2" color="text.secondary" textAlign="center">
            Centro de mando interno de Cumbres Consultoría y Proyectos
          </Typography>
        </Stack>

        <Stack spacing={2}>
          <Button
            variant="contained"
            fullWidth
            startIcon={<Chrome size={18} strokeWidth={1.5} />}
            disabled
          >
            Iniciar sesión con Google
          </Button>
          <Typography variant="caption" color="text.secondary" textAlign="center">
            Solo dominios de Google Workspace aprobados. Deshabilitado hasta que
            `iam-service` emita el flujo OIDC real (Fase 1).
          </Typography>
        </Stack>

        <Divider sx={{ my: 3 }}>
          <Typography variant="caption" color="text.secondary">
            o
          </Typography>
        </Divider>

        <Stack spacing={2} component="form">
          <Typography variant="body2" fontWeight={600}>
            Acceso externo por enlace
          </Typography>
          <TextField
            size="small"
            type="email"
            label="Correo"
            placeholder="tu@correo.com"
            disabled
            fullWidth
          />
          <Button
            variant="outlined"
            fullWidth
            startIcon={<Mail size={18} strokeWidth={1.5} />}
            disabled
          >
            Enviarme un enlace de acceso
          </Button>
          <Typography variant="caption" color="text.secondary">
            El enlace es de un solo uso y expira en 7 días. Deshabilitado hasta
            que `iam-service` genere Magic Links reales (Fase 1).
          </Typography>
        </Stack>
      </Paper>
    </Box>
  );
}
