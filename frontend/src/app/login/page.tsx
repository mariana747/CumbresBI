"use client";

import { Suspense, useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import { Alert, Box, Button, CircularProgress, Paper, Stack, Typography } from "@mui/material";
import { LayoutDashboard, RotateCcw } from "lucide-react";
import { startGoogleLogin } from "@/lib/auth";
import { Footer } from "@/components/Footer";
import { PublicNavbar } from "@/components/PublicNavbar";
import { BRAND } from "@/theme/theme";

// SSO silencioso (Fase 1, Semana 4; decision de producto confirmada, ver
// memoria de sesion "oidc-sso-silencioso-sin-boton-login"): "sin pantalla
// intermedia" es literal, asi que el camino feliz normal NUNCA llega
// aqui - lo intercepta src/middleware.ts (corre en el servidor, antes de
// pintar nada) y redirige 302 directo a /auth/google/start. Esta pagina
// solo se ve en dos casos borde: (a) iam-service regreso con
// ?error=oidc (dominio no aprobado, token invalido, etc. - ver
// auth_views.py), donde si hace falta un boton "Reintentar" explicito; o
// (b) AppShell detecto una cookie presente pero invalida/expirada
// (GET /api/me devolvio 401) y empujo aqui - en ese caso, sin ?error, el
// useEffect de abajo reintenta el redirect automatico igual que haria el
// middleware.

function LoginContent() {
  const searchParams = useSearchParams();
  const hasError = searchParams.get("error") === "oidc";

  useEffect(() => {
    if (!hasError) {
      startGoogleLogin();
    }
  }, [hasError]);

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
            minHeight: 300,
            border: "1px solid",
            borderColor: "divider",
            display: "flex",
            flexDirection: "column",
            justifyContent: "space-between",
            gap: 2,
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

          {hasError ? (
            <>
              <Alert severity="error">
                No se pudo iniciar sesión. Verifica que estés usando tu cuenta de Google Workspace de
                Cumbres.
              </Alert>
              <Button
                variant="contained"
                fullWidth
                startIcon={<RotateCcw size={18} strokeWidth={1.5} />}
                onClick={() => startGoogleLogin()}
              >
                Reintentar
              </Button>
            </>
          ) : (
            <Stack spacing={2} alignItems="center">
              <CircularProgress size={24} />
              <Typography variant="body2" color="text.secondary" textAlign="center">
                Redirigiendo a Google Workspace…
              </Typography>
            </Stack>
          )}
        </Paper>
      </Box>
      <Footer />
    </Box>
  );
}

export default function LoginPage() {
  // useSearchParams requiere Suspense en App Router.
  return (
    <Suspense fallback={null}>
      <LoginContent />
    </Suspense>
  );
}
