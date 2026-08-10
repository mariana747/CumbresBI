"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { Box, CircularProgress, Paper, Stack, Typography, useTheme } from "@mui/material";
import { ShieldAlert, ShieldCheck } from "lucide-react";
import { validarTicketCliente } from "@/lib/pld";
import { PublicNavbar } from "@/components/PublicNavbar";

// Pagina publica (sin AppShell) - a donde llega el cliente externo real al
// abrir el link recibido (hoy, en modo dev, mostrado directo en
// /pld/tickets en vez de enviarse por correo - ver pld/views.py). Calcada
// de app/magic-link/[token]/page.tsx (iam-service), pero pld-service no
// tiene llave privada - no hay JWT que mostrar, solo confirma el acceso y
// el expediente asociado.
//
// Sin formulario de destino todavia (docs/CumbresBI_estado.md, Fase 2:
// "Formularios públicos con reCAPTCHA + Drive API" sigue sin construir) -
// por eso esta pagina solo confirma el acceso, no redirige a un formulario
// real todavia.
export default function PldTicketPage() {
  const theme = useTheme();
  const params = useParams<{ token: string }>();
  const [estado, setEstado] = useState<"cargando" | "valido" | "invalido">("cargando");
  const [error, setError] = useState<string | null>(null);
  const [idContraparte, setIdContraparte] = useState<string | null>(null);

  useEffect(() => {
    validarTicketCliente(params.token)
      .then((resultado) => {
        setIdContraparte(resultado.kyc?.id_contraparte ?? null);
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
                {idContraparte
                  ? `Tu enlace es válido para el expediente ${idContraparte}.`
                  : "Tu enlace es válido."}
              </Typography>
              <Typography variant="caption" color="text.secondary">
                Modo desarrollo — el formulario público de expediente todavía no está conectado.
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
