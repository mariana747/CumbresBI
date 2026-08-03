"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import {
  Box,
  Button,
  CircularProgress,
  Divider,
  Paper,
  Stack,
  TextField,
  Typography,
} from "@mui/material";
import { LayoutDashboard, Chrome, Mail } from "lucide-react";
import { isLoggedIn, login } from "@/lib/auth";

// Pagina publica (sin AppShell / sidebar - el usuario aun no esta
// autenticado). Cero contrasenas: dos vias de entrada, ver
// docs/architecture/README.md sec. 6.
//   - Interna: Google Workspace OIDC. HOY es un stub (ver src/lib/auth.ts) -
//     simula la sesion en localStorage porque iam-service todavia no emite
//     JWT real; el boton SI funciona end-to-end para poder construir el
//     resto de la navegacion mientras se conecta el backend (Fase 1).
//   - Externa: Magic Link, sigue deshabilitado - no hay flujo de invitados
//     que probar todavia.
export default function LoginPage() {
  const router = useRouter();
  const [signingIn, setSigningIn] = useState(false);

  useEffect(() => {
    if (isLoggedIn()) {
      router.replace("/");
    }
  }, [router]);

  function handleGoogleLogin() {
    setSigningIn(true);
    login();
    router.replace("/");
  }

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
            startIcon={
              signingIn ? (
                <CircularProgress size={16} color="inherit" />
              ) : (
                <Chrome size={18} strokeWidth={1.5} />
              )
            }
            onClick={handleGoogleLogin}
            disabled={signingIn}
          >
            {signingIn ? "Iniciando sesión…" : "Iniciar sesión con Google"}
          </Button>
          <Typography variant="caption" color="text.secondary" textAlign="center">
            Solo dominios de Google Workspace aprobados.
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
