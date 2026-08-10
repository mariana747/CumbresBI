"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { Box, CircularProgress, Paper, Stack, Typography, useTheme } from "@mui/material";
import { ShieldAlert, ShieldCheck } from "lucide-react";
import { validateMagicLink } from "@/lib/iam";
import { PublicNavbar } from "@/components/PublicNavbar";

const RECURSO_TIPO_LABELS: Record<string, string> = {
  pld_kyc: "tu expediente KYC",
};

// Pagina publica (sin AppShell) - a donde llega el usuario externo real al
// abrir el link recibido (hoy, en modo dev, mostrado directo en
// /admin/invitaciones (pestaña "Temporales") en vez de enviarse por correo - ver iam/views.py).
// Reemplaza al simulador manual "Probar validacion" de esa pantalla: aqui
// la validacion ocurre sola, sin que nadie pegue el token a mano.
//
// Sin destino por modulo todavia: una vez valido, el JWT de alcance
// externo se emite (ver docs/architecture/README.md sec. 6.2) pero ningun
// modulo tiene aun la pantalla que lo consuma (ej. el formulario KYC de
// PLD) - por eso esta pagina solo confirma el acceso y muestra el JWT en
// modo dev, en lugar de redirigir. Cuando exista ese destino, se reemplaza
// el bloque de "acceso verificado" por la redireccion correspondiente.
export default function MagicLinkPage() {
  const theme = useTheme();
  const params = useParams<{ token: string }>();
  const [estado, setEstado] = useState<"cargando" | "valido" | "invalido">("cargando");
  const [error, setError] = useState<string | null>(null);
  const [recursoTipo, setRecursoTipo] = useState<string | null>(null);
  const [jwt, setJwt] = useState<string | null>(null);

  useEffect(() => {
    validateMagicLink(params.token)
      .then((resultado) => {
        setRecursoTipo(resultado.magic_link.recurso_tipo);
        setJwt(resultado.jwt);
        setEstado("valido");
      })
      .catch((err) => {
        setError(err instanceof Error ? err.message : "Enlace inválido.");
        setEstado("invalido");
      });
  }, [params.token]);

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
            maxWidth: 420,
            border: "1px solid",
            borderColor: "divider",
          }}
        >
        {estado === "cargando" && (
          <Stack spacing={2} alignItems="center">
            <CircularProgress size={28} />
            <Typography variant="body2" color="text.secondary">
              Verificando tu enlace de acceso…
            </Typography>
          </Stack>
        )}

        {estado === "valido" && (
          <Stack spacing={2} alignItems="center" textAlign="center">
            <ShieldCheck size={32} strokeWidth={1.5} color={theme.palette.success.main} />
            <Typography variant="subtitle1" fontWeight={600}>
              Acceso verificado
            </Typography>
            <Typography variant="body2" color="text.secondary">
              {recursoTipo && RECURSO_TIPO_LABELS[recursoTipo]
                ? `Tu enlace es válido para ${RECURSO_TIPO_LABELS[recursoTipo]}.`
                : "Tu enlace es válido."}
            </Typography>
            <Typography variant="caption" color="text.secondary">
              Modo desarrollo — la pantalla de destino de este recurso todavía no está conectada.
              Token de sesión emitido:
            </Typography>
            <Typography
              component="pre"
              variant="caption"
              sx={{ wordBreak: "break-all", whiteSpace: "pre-wrap", textAlign: "left" }}
            >
              {jwt}
            </Typography>
          </Stack>
        )}

        {estado === "invalido" && (
          <Stack spacing={2} alignItems="center" textAlign="center">
            <ShieldAlert size={32} strokeWidth={1.5} color={theme.palette.error.dark} />
            <Typography variant="subtitle1" fontWeight={600}>
              Enlace no disponible
            </Typography>
            <Typography variant="body2" color="text.secondary">
              {error}
            </Typography>
            <Typography variant="caption" color="text.secondary">
              Si necesitas un nuevo enlace, contacta a quien te lo compartió.
            </Typography>
          </Stack>
        )}
        </Paper>
      </Box>
    </Box>
  );
}
