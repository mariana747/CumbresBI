"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import {
  Accordion,
  AccordionDetails,
  AccordionSummary,
  Alert,
  Box,
  Button,
  Checkbox,
  CircularProgress,
  Divider,
  List,
  ListItem,
  ListItemButton,
  ListItemIcon,
  ListItemText,
  MenuItem,
  Paper,
  Stack,
  TextField,
  Typography,
  useTheme,
} from "@mui/material";
import { CheckCircle2, ChevronDown, ShieldAlert, ShieldCheck, UploadCloud } from "lucide-react";
import { actualizarDatosPublico, PldDatosEditables, subirDocumentosPublico, validarTicketCliente } from "@/lib/pld";
import { PublicNavbar } from "@/components/PublicNavbar";
import RecaptchaV2 from "@/components/RecaptchaV2";

// Grupos del formulario de datos (17/Ago/2026) - mismo whitelist que
// PLD_CAMPOS_CONFIRMABLES (lib/pld.ts), agrupados solo para presentacion.
const GRUPOS_DATOS: { titulo: string; campos: { campo: keyof PldDatosEditables; label: string }[] }[] = [
  {
    titulo: "Identificación",
    campos: [
      { campo: "curp", label: "CURP" },
      { campo: "nacionalidad", label: "Nacionalidad" },
      { campo: "pais_nac_const", label: "País de nacimiento / constitución" },
      { campo: "fecha_nac_const", label: "Fecha de nacimiento / constitución (AAAA-MM-DD)" },
      { campo: "tipo_identificacion", label: "Tipo de identificación" },
      { campo: "numero_identificacion", label: "Número de identificación" },
      { campo: "autoridad_identificacion", label: "Autoridad que emitió la identificación" },
      { campo: "estado_civil", label: "Estado civil" },
      { campo: "ocupacion_act_economica", label: "Ocupación / actividad económica" },
      { campo: "folio_mercantil", label: "Folio mercantil" },
      { campo: "objeto_social", label: "Objeto social" },
      { campo: "ident_fideicomiso", label: "Identificación de fideicomiso" },
    ],
  },
  {
    titulo: "Domicilio",
    campos: [
      { campo: "dom_calle", label: "Calle" },
      { campo: "dom_numero_ext", label: "Número exterior" },
      { campo: "dom_numero_int", label: "Número interior" },
      { campo: "dom_colonia", label: "Colonia" },
      { campo: "dom_municipio_alcaldia", label: "Municipio / alcaldía" },
      { campo: "dom_estado", label: "Estado" },
      { campo: "dom_cp", label: "Código postal" },
      { campo: "dom_pais", label: "País" },
    ],
  },
  {
    titulo: "Domicilio de correspondencia (si es distinto)",
    campos: [
      { campo: "dom_corresp_dom_calle", label: "Calle" },
      { campo: "dom_corresp_dom_numero_ext", label: "Número exterior" },
      { campo: "dom_corresp_dom_numero_int", label: "Número interior" },
      { campo: "dom_corresp_dom_colonia", label: "Colonia" },
      { campo: "dom_corresp_dom_municipio_alcaldia", label: "Municipio / alcaldía" },
      { campo: "dom_corresp_dom_estado", label: "Estado" },
      { campo: "dom_corresp_dom_cp", label: "Código postal" },
      { campo: "dom_corresp_dom_pais", label: "País" },
    ],
  },
  {
    titulo: "Contacto",
    campos: [
      { campo: "telefono_fijo", label: "Teléfono fijo" },
      { campo: "telefono_sms", label: "Teléfono para SMS" },
    ],
  },
  {
    titulo: "Comentarios",
    campos: [{ campo: "comentarios", label: "Comentarios adicionales" }],
  },
];

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

  // Mismo patron que MotorDocumentalDialog: todos los archivos elegidos
  // quedan listados con checkbox, marcados por default - el usuario
  // desmarca los que no quiere incluir en vez de tener que volver a abrir
  // el selector del sistema operativo (ver toggleSeleccionado ahi).
  const [archivos, setArchivos] = useState<File[]>([]);
  const [seleccionados, setSeleccionados] = useState<Set<number>>(new Set());
  const [recaptchaToken, setRecaptchaToken] = useState<string | null>(null);
  const [subiendo, setSubiendo] = useState(false);
  const [subidaError, setSubidaError] = useState<string | null>(null);
  const [subidaOk, setSubidaOk] = useState<string | null>(null);

  // Datos del formulario (17/Ago/2026) - se precargan con lo que ya haya en
  // el expediente (si el cliente vuelve a entrar con el mismo link, ve lo
  // que ya puso antes) y se pueden corregir en cualquier momento.
  const [datos, setDatos] = useState<PldDatosEditables>({});
  const [guardando, setGuardando] = useState(false);
  const [guardadoError, setGuardadoError] = useState<string | null>(null);
  const [guardadoOk, setGuardadoOk] = useState(false);

  useEffect(() => {
    validarTicketCliente(params.token)
      .then((resultado) => {
        setIdContraparte(resultado.kyc?.id_contraparte ?? null);
        setTieneExpediente(Boolean(resultado.kyc));
        if (resultado.kyc) {
          const todosLosCampos = GRUPOS_DATOS.flatMap((g) => g.campos.map((c) => c.campo));
          setDatos(Object.fromEntries(todosLosCampos.map((c) => [c, resultado.kyc?.[c] ?? ""])));
        }
        setEstado("valido");
      })
      .catch((err) => {
        setError(err instanceof Error ? err.message : "Enlace inválido.");
        setEstado("invalido");
      });
  }, [params.token]);

  async function handleGuardarDatos(e: React.FormEvent) {
    e.preventDefault();
    setGuardando(true);
    setGuardadoError(null);
    setGuardadoOk(false);
    try {
      // No manda campos vacios - evita borrar en el expediente algo que el
      // analista ya tenia capturado si el cliente deja un campo en blanco.
      const campos = Object.fromEntries(Object.entries(datos).filter(([, v]) => v !== "" && v != null));
      await actualizarDatosPublico({ token: params.token, campos });
      setGuardadoOk(true);
    } catch (err) {
      setGuardadoError(err instanceof Error ? err.message : "Error al guardar tus datos.");
    } finally {
      setGuardando(false);
    }
  }

  function toggleSeleccionado(index: number) {
    setSeleccionados((prev) => {
      const next = new Set(prev);
      if (next.has(index)) next.delete(index);
      else next.add(index);
      return next;
    });
  }

  async function handleSubir(e: React.FormEvent) {
    e.preventDefault();
    const elegidos = archivos.filter((_, i) => seleccionados.has(i));
    if (elegidos.length === 0 || !recaptchaToken) return;
    setSubiendo(true);
    setSubidaError(null);
    setSubidaOk(null);
    try {
      const resultados = await subirDocumentosPublico({ token: params.token, recaptchaToken, files: elegidos });
      const fallidos = resultados.filter((r) => !r.ok);
      if (fallidos.length === 0) {
        setSubidaOk(
          resultados.length === 1
            ? `"${resultados[0].nombre_archivo}" se subió correctamente.`
            : `Se subieron ${resultados.length} archivos correctamente.`
        );
        setArchivos([]);
        setSeleccionados(new Set());
      } else {
        setSubidaError(
          `${fallidos.length} de ${resultados.length} archivo(s) no se pudieron subir: ${fallidos
            .map((r) => r.nombre_archivo)
            .join(", ")}. Intenta de nuevo con esos.`
        );
        // Deja marcados (checkbox) solo los que fallaron, para reintentar sin repetir los que ya se subieron.
        const nombresFallidos = new Set(fallidos.map((r) => r.nombre_archivo));
        setSeleccionados(
          new Set(archivos.map((f, i) => i).filter((i) => nombresFallidos.has(archivos[i].name)))
        );
      }
      setRecaptchaToken(null);
    } catch (err) {
      setSubidaError(err instanceof Error ? err.message : "Error al subir los documentos.");
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
            maxWidth: 920,
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
                <Stack direction={{ xs: "column", md: "row" }} spacing={3} divider={<Divider orientation="vertical" flexItem sx={{ display: { xs: "none", md: "block" } }} />}>
                  <Stack component="form" spacing={2} onSubmit={handleGuardarDatos} sx={{ flex: 1, minWidth: 0 }}>
                    <Typography variant="subtitle2">Tus datos</Typography>
                    <Typography variant="caption" color="text.secondary">
                      Si ya habías capturado tus datos antes con este mismo enlace, aquí los ves y puedes
                      corregirlos. Un campo en blanco no borra lo que ya estaba guardado.
                    </Typography>

                    {GRUPOS_DATOS.map((grupo) => (
                      <Accordion key={grupo.titulo} disableGutters>
                        <AccordionSummary expandIcon={<ChevronDown size={18} strokeWidth={1.5} />}>
                          <Typography variant="body2" fontWeight={600}>
                            {grupo.titulo}
                          </Typography>
                        </AccordionSummary>
                        <AccordionDetails>
                          <Stack spacing={1.5}>
                            {grupo.campos.map(({ campo, label }) =>
                              campo === "estado_civil" ? (
                                <TextField
                                  key={campo}
                                  select
                                  size="small"
                                  label={label}
                                  value={datos[campo] ?? ""}
                                  onChange={(e) => setDatos((prev) => ({ ...prev, [campo]: e.target.value }))}
                                >
                                  <MenuItem value="SOLTERO">Soltero</MenuItem>
                                  <MenuItem value="CASADO">Casado</MenuItem>
                                </TextField>
                              ) : (
                                <TextField
                                  key={campo}
                                  size="small"
                                  label={label}
                                  multiline={campo === "comentarios" || campo === "objeto_social"}
                                  value={datos[campo] ?? ""}
                                  onChange={(e) => setDatos((prev) => ({ ...prev, [campo]: e.target.value }))}
                                />
                              )
                            )}
                          </Stack>
                        </AccordionDetails>
                      </Accordion>
                    ))}

                    {guardadoError && <Alert severity="error">{guardadoError}</Alert>}
                    {guardadoOk && (
                      <Alert severity="success" icon={<CheckCircle2 size={20} strokeWidth={1.5} />}>
                        Tus datos se guardaron correctamente.
                      </Alert>
                    )}

                    <Button type="submit" variant="contained" disabled={guardando}>
                      {guardando ? <CircularProgress size={20} color="inherit" /> : "Guardar mis datos"}
                    </Button>
                  </Stack>

                  <Stack component="form" spacing={2} onSubmit={handleSubir} sx={{ flex: 1, minWidth: 0 }}>
                    <Typography variant="subtitle2">Subir documento</Typography>

                    <Button component="label" variant="outlined" startIcon={<UploadCloud size={18} strokeWidth={1.5} />}>
                    {archivos.length > 0
                      ? `${archivos.length} archivo(s) seleccionado(s)`
                      : "Seleccionar archivos"}
                    <input
                      type="file"
                      hidden
                      multiple
                      // Acumula en vez de reemplazar - el cliente puede abrir el
                      // selector varias veces (uno por uno, o varios de golpe
                      // cada vez) y todo se va agregando a la misma lista, en
                      // vez de perder lo ya elegido cada vez que vuelve a abrir
                      // el selector del sistema operativo.
                      onChange={(e) => {
                        const nuevos = Array.from(e.target.files ?? []);
                        if (nuevos.length === 0) return;
                        setArchivos((prev) => {
                          const base = prev.length;
                          setSeleccionados((prevSel) => {
                            const next = new Set(prevSel);
                            nuevos.forEach((_, i) => next.add(base + i));
                            return next;
                          });
                          return [...prev, ...nuevos];
                        });
                        // Limpia el input para poder re-seleccionar el mismo
                        // archivo despues si lo quita y lo quiere agregar de nuevo.
                        e.target.value = "";
                      }}
                    />
                  </Button>

                  {archivos.length > 0 && (
                    <List dense sx={{ bgcolor: "background.default", borderRadius: 1 }}>
                      {archivos.map((f, i) => (
                        <ListItem key={`${f.name}-${i}`} disablePadding>
                          <ListItemButton onClick={() => toggleSeleccionado(i)} dense>
                            <ListItemIcon sx={{ minWidth: 36 }}>
                              <Checkbox edge="start" checked={seleccionados.has(i)} tabIndex={-1} disableRipple size="small" />
                            </ListItemIcon>
                            <ListItemText
                              primary={f.name}
                              secondary={`${(f.size / 1024).toFixed(0)} KB`}
                              primaryTypographyProps={{ variant: "body2", noWrap: true }}
                              secondaryTypographyProps={{ variant: "caption" }}
                            />
                          </ListItemButton>
                        </ListItem>
                      ))}
                    </List>
                  )}

                  <RecaptchaV2 onChange={setRecaptchaToken} />

                  {subidaError && <Alert severity="error">{subidaError}</Alert>}
                  {subidaOk && (
                    <Alert severity="success" icon={<CheckCircle2 size={20} strokeWidth={1.5} />}>
                      {subidaOk}
                    </Alert>
                  )}

                  <Button type="submit" variant="contained" disabled={seleccionados.size === 0 || !recaptchaToken || subiendo}>
                    {subiendo ? (
                      <CircularProgress size={20} color="inherit" />
                    ) : (
                      `Subir ${seleccionados.size > 1 ? `${seleccionados.size} documentos` : "documento"}`
                    )}
                  </Button>
                  </Stack>
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
