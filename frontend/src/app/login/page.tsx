"use client";

import { Suspense } from "react";
import { useSearchParams } from "next/navigation";
import { Alert, Box, Button, Paper, Stack, Typography } from "@mui/material";
import { LayoutDashboard, LogIn } from "lucide-react";
import { startGoogleLogin } from "@/lib/auth";
import { Footer } from "@/components/Footer";
import { PublicNavbar } from "@/components/PublicNavbar";
import { BRAND } from "@/theme/theme";

// YA NO es SSO silencioso automatico (15/Sep/2026, revierte la decision
// de "SSO silencioso sin boton" - ver memoria de sesion
// "oidc-sso-silencioso-sin-boton-login"): un redirect 100% automatico sin
// interaccion real de usuario hacia accounts.google.com y de vuelta es
// exactamente el patron que la "Bounce Tracking Mitigation" de Chrome
// detecta y sanciona borrando el estado (cookies) del sitio que orquesto
// el bounce - encontrado real el mismo dia (el Set-Cookie de sesion SI
// llegaba, pero Chrome la purgaba enseguida, loop infinito). Un clic real
// del usuario en el boton de abajo cuenta como interaccion genuina y
// evita esta proteccion. src/middleware.ts ahora manda aqui a cualquiera
// sin sesion (antes saltaba directo a Google sin pasar por esta pagina).
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

          {hasError && <Alert severity="error">{mensajeError}</Alert>}
          <Button
            variant="contained"
            fullWidth
            startIcon={<LogIn size={18} strokeWidth={1.5} />}
            onClick={() => startGoogleLogin()}
          >
            {hasError ? "Reintentar" : "Iniciar sesión con Google"}
          </Button>
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
