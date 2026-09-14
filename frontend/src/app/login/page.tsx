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
// solo se ve en casos borde: (a) iam-service regreso con algun ?error=
// (dominio no aprobado, invitacion revocada, cuenta suspendida, etc. -
// ver auth_views.py), donde si hace falta un boton "Reintentar" explicito
// en vez de reintentar solo; o (b) AppShell detecto una cookie presente
// pero invalida/expirada (GET /api/me devolvio 401) y empujo aqui - en
// ese caso, sin ?error, el useEffect de abajo reintenta el redirect
// automatico igual que haria el middleware.
//
// Mensajes por codigo (14/Ago/2026, hallazgo: antes solo "oidc" se
// reconocia como error - cualquier otro codigo real que ya emitia el
// backend (sin_invitacion/cuenta_suspendida/acceso_revocado/
// acceso_invalido) caia al else y reintentaba el login solo, que volvia a
// fallar y volvia a redirigir aqui - un bucle infinito sin mostrar nunca
// el motivo real).
const MENSAJES_ERROR: Record<string, string> = {
  sin_invitacion:
    "Tu invitación fue revocada o todavía no existe. Pide a un administrador que te invite de nuevo.",
  cuenta_suspendida:
    "Tu cuenta está suspendida. Contacta a un administrador para que la reactive.",
  acceso_revocado: "Este enlace de acceso fue revocado. Pide uno nuevo a un administrador.",
  acceso_invalido: "Este enlace de acceso no es válido.",
};
const MENSAJE_DEFAULT =
  "No se pudo iniciar sesión. Verifica que estés usando tu cuenta de Google Workspace de Cumbres.";

function LoginContent() {
  const searchParams = useSearchParams();
  const errorCode = searchParams.get("error");
  const hasError = !!errorCode;
  const mensajeError = errorCode ? (MENSAJES_ERROR[errorCode] ?? MENSAJE_DEFAULT) : "";

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
              <Alert severity="error">{mensajeError}</Alert>
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
