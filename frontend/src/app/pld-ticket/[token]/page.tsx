"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { Alert, Box, Button, CircularProgress, Paper, Stack, Typography, useTheme } from "@mui/material";
import { CheckCircle2, ShieldAlert, ShieldCheck, UploadCloud } from "lucide-react";
import { subirDocumentoPublico, validarTicketCliente } from "@/lib/pld";
import { PublicNavbar } from "@/components/PublicNavbar";
import RecaptchaV2 from "@/components/RecaptchaV2";

// Pagina publica (sin AppShell) - a donde llega el cliente externo real al
// abrir el link recibido (hoy, en modo dev, mostrado directo en
// /pld/tickets en vez de enviarse por correo - ver pld/views.py). Calcada
// de app/magic-link/[token]/page.tsx (iam-service), pero pld-service no
// tiene llave privada - no hay JWT que mostrar, solo confirma el acceso y
// el expediente asociado.
//
// Formulario de subida (docs/architecture/pld-fase2-alcance.md sec. 2,
// decision de Mariana 12/Ago/2026): solo sube documentos (sin campos de
// datos personales) + reCAPTCHA v2 - el archivo va al mismo flujo de
// Drive que usaria un analista interno (ver pld/views.py::subir_documento).
export default function PldTicketPage() {
  const theme = useTheme();
  const params = useParams<{ token: string }>();
  const [estado, setEstado] = useState<"cargando" | "valido" | "invalido">("cargando");
  const [error, setError] = useState<string | null>(null);
  const [idContraparte, setIdContraparte] = useState<string | null>(null);
  const [tieneExpediente, setTieneExpediente] = useState(false);

  const [archivo, setArchivo] = useState<File | null>(null);
  const [recaptchaToken, setRecaptchaToken] = useState<string | null>(null);
  const [subiendo, setSubiendo] = useState(false);
  const [subidaError, setSubidaError] = useState<string | null>(null);
  const [subidaOk, setSubidaOk] = useState<string | null>(null);

  useEffect(() => {
    validarTicketCliente(params.token)
      .then((resultado) => {
        setIdContraparte(resultado.kyc?.id_contraparte ?? null);
        setTieneExpediente(Boolean(resultado.kyc));
        setEstado("valido");
      })
      .catch((err) => {
        setError(err instanceof Error ? err.message : "Enlace inválido.");
        setEstado("invalido");
      });
  }, [params.token]);

  async function handleSubir(e: React.FormEvent) {
    e.preventDefault();
    if (!archivo || !recaptchaToken) return;
    setSubiendo(true);
    setSubidaError(null);
    setSubidaOk(null);
    try {
      await subirDocumentoPublico({ token: params.token, recaptchaToken, file: archivo });
      setSubidaOk(`"${archivo.name}" se subió correctamente.`);
      setArchivo(null);
      setRecaptchaToken(null);
    } catch (err) {
      setSubidaError(err instanceof Error ? err.message : "Error al subir el documento.");
    } finally {
      setSubiendo(false);
    }
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
            maxWidth: 460,
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
            <Stack spacing={2.5}>
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
              </Stack>

              {!tieneExpediente ? (
                <Alert severity="info">Este enlace no tiene un expediente asociado para subir documentos.</Alert>
              ) : (
                <Stack component="form" spacing={2} onSubmit={handleSubir}>
                  <Typography variant="subtitle2">Subir documento</Typography>

                  <Button component="label" variant="outlined" startIcon={<UploadCloud size={18} strokeWidth={1.5} />}>
                    {archivo ? archivo.name : "Seleccionar archivo"}
                    <input
                      type="file"
                      hidden
                      onChange={(e) => setArchivo(e.target.files?.[0] ?? null)}
                    />
                  </Button>

                  <RecaptchaV2 onChange={setRecaptchaToken} />

                  {subidaError && <Alert severity="error">{subidaError}</Alert>}
                  {subidaOk && (
                    <Alert severity="success" icon={<CheckCircle2 size={20} strokeWidth={1.5} />}>
                      {subidaOk}
                    </Alert>
                  )}

                  <Button type="submit" variant="contained" disabled={!archivo || !recaptchaToken || subiendo}>
                    {subiendo ? <CircularProgress size={20} color="inherit" /> : "Subir documento"}
                  </Button>
                </Stack>
              )}
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
