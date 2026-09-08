"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { Alert, Box, Button, CircularProgress, Paper, Stack, Typography, useTheme } from "@mui/material";
import { CheckCircle2, ShieldAlert, ShieldCheck, UploadCloud } from "lucide-react";
import { subirFacturaTicketProveedor, validarTicketProveedor } from "@/lib/tesoreria";
import { PublicNavbar } from "@/components/PublicNavbar";
import RecaptchaV2 from "@/components/RecaptchaV2";

// Pagina publica (sin AppShell, sin login) - a donde llega el proveedor
// externo real al abrir el link de su ticket (27/Ago/2026, mismo patron
// que app/pld-ticket/[token]/page.tsx, pero mas simple: un solo PDF, sin
// formulario de datos personales - una factura no necesita eso).
// Contrato: TesoreriaTicketProveedorViewSet.validar/subir_factura.
const MAX_TAMANO_ARCHIVO_MB = 5;
const MAX_TAMANO_ARCHIVO_BYTES = MAX_TAMANO_ARCHIVO_MB * 1024 * 1024;

export default function TesoreriaTicketPage() {
  const theme = useTheme();
  const params = useParams<{ token: string }>();
  const [estado, setEstado] = useState<"cargando" | "valido" | "invalido">("cargando");
  const [error, setError] = useState<string | null>(null);
  const [contraparteNombre, setContraparteNombre] = useState<string | null>(null);

  const [archivo, setArchivo] = useState<File | null>(null);
  // XML opcional (07/Sep/2026, "debe poder subir el PDF y el XML") - el
  // CFDI real, con el 100% de los datos fiscales (el PDF es solo una
  // representacion impresa, puede omitir campos enteros).
  const [archivoXml, setArchivoXml] = useState<File | null>(null);
  const [errorSeleccion, setErrorSeleccion] = useState<string | null>(null);
  const [recaptchaToken, setRecaptchaToken] = useState<string | null>(null);
  const [subiendo, setSubiendo] = useState(false);
  const [subidaError, setSubidaError] = useState<string | null>(null);
  const [subidaCompleta, setSubidaCompleta] = useState(false);

  useEffect(() => {
    validarTicketProveedor(params.token)
      .then((ticket) => {
        setContraparteNombre(ticket.contraparte_nombre);
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
      await subirFacturaTicketProveedor({
        token: params.token,
        recaptchaToken,
        file: archivo,
        fileXml: archivoXml || undefined,
      });
      setSubidaCompleta(true);
    } catch (err) {
      setSubidaError(err instanceof Error ? err.message : "Error al subir la factura.");
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
                {contraparteNombre && (
                  <Typography variant="body2" color="text.secondary">
                    Estás subiendo una factura para <strong>{contraparteNombre}</strong>.
                  </Typography>
                )}
              </Stack>

              {subidaCompleta ? (
                <Stack spacing={2} alignItems="center" textAlign="center" sx={{ py: 4 }}>
                  <CheckCircle2 size={40} strokeWidth={1.5} color={theme.palette.success.main} />
                  <Typography variant="subtitle1" fontWeight={600}>
                    ¡Gracias! Tu factura fue recibida
                  </Typography>
                  <Typography variant="body2" color="text.secondary">
                    Tesorería la va a procesar en breve.
                  </Typography>
                </Stack>
              ) : (
                <Stack component="form" spacing={2} onSubmit={handleSubir}>
                  <Typography variant="subtitle2">Sube tu factura (PDF y XML)</Typography>
                  <Typography variant="caption" color="text.secondary">
                    El PDF es obligatorio; el XML es opcional pero recomendado — trae todos los datos
                    fiscales completos. Máximo {MAX_TAMANO_ARCHIVO_MB}MB por archivo.
                  </Typography>

                  <Button component="label" variant="outlined" startIcon={<UploadCloud size={18} strokeWidth={1.5} />}>
                    {archivo ? archivo.name : "Seleccionar PDF"}
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
                  <Button component="label" variant="outlined" startIcon={<UploadCloud size={18} strokeWidth={1.5} />}>
                    {archivoXml ? archivoXml.name : "Seleccionar XML (opcional)"}
                    <input
                      type="file"
                      hidden
                      // NOTA (08/Sep/2026): se probo aceptar XPS como
                      // alternativa aqui, pero se descarto - Gemini no lo
                      // lee, no sirve para el Motor Documental ni para
                      // comparar contra el PDF. Solo XML.
                      accept="application/xml,text/xml,.xml"
                      onChange={(e) => {
                        const elegido = e.target.files?.[0];
                        setErrorSeleccion(null);
                        if (!elegido) {
                          setArchivoXml(null);
                          return;
                        }
                        if (elegido.size > MAX_TAMANO_ARCHIVO_BYTES) {
                          setErrorSeleccion(`El archivo supera ${MAX_TAMANO_ARCHIVO_MB}MB.`);
                          setArchivoXml(null);
                          return;
                        }
                        setArchivoXml(elegido);
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
                    {subiendo ? <CircularProgress size={20} color="inherit" /> : "Subir factura"}
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
