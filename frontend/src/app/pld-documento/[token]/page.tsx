"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { Alert, Box, Button, CircularProgress, Paper, Stack, Typography, useTheme } from "@mui/material";
import { CheckCircle2, ShieldAlert, ShieldCheck, UploadCloud } from "lucide-react";
import { subirDocumentoTicketPld, validarTicketDocumentoPld } from "@/lib/pld";
import { PublicNavbar } from "@/components/PublicNavbar";
import RecaptchaV2 from "@/components/RecaptchaV2";

// Pagina publica (sin AppShell, sin login) - a donde llega el cliente al
// abrir el link de un documento faltante del checklist de su expediente
// KYC (04/Sep/2026, pedido explicito de Mariana: "hay que unificar la
// solicitud de documento como en contratos"). Mismo patron exacto que
// app/tesoreria-documento/[token]/page.tsx, pero ligado a UN documento
// especifico del expediente en vez de a un contrato. Contrato:
// PldDocumentoTicketViewSet.validar/subir.
const MAX_TAMANO_ARCHIVO_MB = 5;
const MAX_TAMANO_ARCHIVO_BYTES = MAX_TAMANO_ARCHIVO_MB * 1024 * 1024;

export default function PldDocumentoTicketPage() {
  const theme = useTheme();
  const params = useParams<{ token: string }>();
  const [estado, setEstado] = useState<"cargando" | "valido" | "invalido">("cargando");
  const [error, setError] = useState<string | null>(null);
  const [nombreDocumento, setNombreDocumento] = useState<string | null>(null);
  const [idContraparte, setIdContraparte] = useState<string | null>(null);

  const [archivo, setArchivo] = useState<File | null>(null);
  const [errorSeleccion, setErrorSeleccion] = useState<string | null>(null);
  const [recaptchaToken, setRecaptchaToken] = useState<string | null>(null);
  const [subiendo, setSubiendo] = useState(false);
  const [subidaError, setSubidaError] = useState<string | null>(null);
  const [subidaCompleta, setSubidaCompleta] = useState(false);

  useEffect(() => {
    validarTicketDocumentoPld(params.token)
      .then((ticket) => {
        setNombreDocumento(ticket.nombre_documento);
        setIdContraparte(ticket.id_contraparte);
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
    try {
      await subirDocumentoTicketPld({ token: params.token, recaptchaToken, file: archivo });
      setSubidaCompleta(true);
    } catch (err) {
      setSubidaError(err instanceof Error ? err.message : "Error al subir el documento.");
      setRecaptchaToken(null);
    } finally {
      setSubiendo(false);
    }
  }

  return (
    <Box sx={{ minHeight: "100vh", display: "flex", flexDirection: "column", bgcolor: "background.default" }}>
      <PublicNavbar />
      <Box sx={{ flex: 1, display: "flex", alignItems: "flex-start", justifyContent: "center", p: 2 }}>
        <Paper
          elevation={0}
          sx={{ p: { xs: 3, sm: 4 }, width: "100%", maxWidth: 560, border: "1px solid", borderColor: "divider" }}
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
                  Acceso Verificado
                </Typography>
                {nombreDocumento && (
                  <Typography variant="body2" color="text.secondary">
                    Nos falta que nos hagas llegar: <strong>{nombreDocumento}</strong>
                    {idContraparte && <> de tu expediente <strong>{idContraparte}</strong></>}.
                  </Typography>
                )}
              </Stack>

              {subidaCompleta ? (
                <Stack spacing={2} alignItems="center" textAlign="center" sx={{ py: 4 }}>
                  <CheckCircle2 size={40} strokeWidth={1.5} color={theme.palette.success.main} />
                  <Typography variant="subtitle1" fontWeight={600}>
                    ¡Gracias! Tu documento fue recibido
                  </Typography>
                  <Typography variant="body2" color="text.secondary">
                    Lo vamos a procesar en breve.
                  </Typography>
                </Stack>
              ) : (
                <Stack component="form" spacing={2} onSubmit={handleSubir}>
                  <Typography variant="subtitle2">Sube tu documento (PDF o foto)</Typography>
                  <Typography variant="caption" color="text.secondary">
                    Un solo archivo, máximo {MAX_TAMANO_ARCHIVO_MB}MB.
                  </Typography>

                  <Button component="label" variant="outlined" startIcon={<UploadCloud size={18} strokeWidth={1.5} />}>
                    {archivo ? archivo.name : "Seleccionar archivo"}
                    <input
                      type="file"
                      hidden
                      accept="application/pdf,image/*"
                      onChange={(e) => {
                        const elegido = e.target.files?.[0];
                        setErrorSeleccion(null);
                        if (!elegido) {
                          setArchivo(null);
                          return;
                        }
                        if (elegido.size > MAX_TAMANO_ARCHIVO_BYTES) {
                          setErrorSeleccion(`El archivo supera ${MAX_TAMANO_ARCHIVO_MB}MB.`);
                          setArchivo(null);
                          return;
                        }
                        setArchivo(elegido);
                      }}
                    />
                  </Button>
                  {errorSeleccion && <Alert severity="error">{errorSeleccion}</Alert>}

                  <RecaptchaV2
                    onChange={(token) => {
                      setRecaptchaToken(token);
                      if (token) setSubidaError(null);
                    }}
                  />

                  {subidaError && <Alert severity="error">{subidaError}</Alert>}

                  <Button type="submit" variant="contained" disabled={!archivo || !recaptchaToken || subiendo}>
                    {subiendo ? <CircularProgress size={20} color="inherit" /> : "Subir Documento"}
                  </Button>
                </Stack>
              )}
            </Stack>
          )}

          {estado === "invalido" && (
            <Stack spacing={2} alignItems="center" textAlign="center">
              <ShieldAlert size={32} strokeWidth={1.5} color={theme.palette.error.dark} />
              <Typography variant="subtitle1" fontWeight={600}>
                Enlace no Disponible
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
