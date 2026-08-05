"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import {
  Box,
  Button,
  CircularProgress,
  Paper,
  Stack,
  Typography,
} from "@mui/material";
import { LayoutDashboard, Chrome } from "lucide-react";
import { isLoggedIn, login } from "@/lib/auth";
import { Footer } from "@/components/Footer";
import { PublicNavbar } from "@/components/PublicNavbar";
import { BRAND } from "@/theme/theme";

// Pagina publica (sin AppShell / sidebar - el usuario aun no esta
// autenticado). Cero contrasenas, ver docs/architecture/README.md sec. 6.
//   - Interna: Google Workspace OIDC. HOY es un stub (ver src/lib/auth.ts) -
//     simula la sesion en localStorage porque iam-service todavia no emite
//     JWT real; el boton SI funciona end-to-end para poder construir el
//     resto de la navegacion mientras se conecta el backend (Fase 1).
//   - Externa: Magic Link - se quito el formulario de esta pantalla (nunca
//     estuvo habilitado, no hay flujo de invitados que probar todavia); el
//     flujo real de consumo vive en app/magic-link/[token]/page.tsx, que no
//     depende de este formulario.
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
        flexDirection: "column",
        bgcolor: "background.default",
      }}
    >
      <PublicNavbar />
      <Box
        sx={{
          flex: 1,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          p: 2,
        }}
      >
        <Paper
          elevation={0}
          sx={{
            p: { xs: 3, sm: 4 },
            width: "100%",
            maxWidth: 380,
            height: 300,
            border: "1px solid",
            borderColor: "divider",
            display: "flex",
            flexDirection: "column",
            justifyContent: "space-between",
          }}
        >
          <Stack spacing={1} alignItems="center">
            <LayoutDashboard size={30} strokeWidth={4} color={BRAND.azul} />
          </Stack>

          <Stack spacing={1} alignItems="center">
            <Typography variant="h6" fontWeight={600}>
              CumbresBI
            </Typography>
          </Stack>

          <Stack spacing={1} alignItems="center">
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
        </Paper>
      </Box>
      <Footer />
    </Box>
  );
}
