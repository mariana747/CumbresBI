"use client";

import { useEffect, useState } from "react";
import {
  Alert,
  Box,
  Button,
  Card,
  CardContent,
  Chip,
  CircularProgress,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  Divider,
  FormControl,
  IconButton,
  InputLabel,
  Link as MuiLink,
  MenuItem,
  Paper,
  Select,
  Stack,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  TextField,
  Typography,
  useMediaQuery,
  useTheme,
} from "@mui/material";
import { Camera, Plus, Trash2, Upload, X as CloseIcon } from "lucide-react";
import AppShell from "@/components/AppShell";
import EscanerDocumento from "@/components/EscanerDocumento";
import { getSession, SessionUser } from "@/lib/auth";
import { GeneralSociedad, listSociedades } from "@/lib/iam";
import {
  crearTicketReembolso,
  getFechaLimiteReembolso,
  CATEGORIA_GASTO_LABELS,
  listTicketsReembolso,
  subirFotoTicket,
  TesoreriaCategoriaGasto,
  TesoreriaFechaLimiteReembolso,
  TesoreriaTicketEstado,
  TesoreriaTicketReembolso,
} from "@/lib/miCumbres";

// Pantalla PROVISIONAL de "MiCumbres" (27/Ago/2026, pedido de Mariana) -
// el empleado sube su ticket de gasto. La revision (adjuntar factura,
// Motor Documental, vincular pago) se movio a Tesorería > Facturas > tab
// "Tickets de reembolso" (27/Ago/2026, mismo día - pedido de Mariana: la
// revision debe vivir donde Tesoreria ya trabaja, ver
// TicketsReembolsoAdminPanel) - esta pantalla YA NO tiene ninguna accion
// de administracion, solo crear + ver el estado de los tickets propios.
// NO es el portal MiCumbres final (Fase 5, RRHH, sin arrancar) - ver
// memoria de sesion "rrhh-mi-cumbres-y-modulo-pendiente".
//
// Regla de permisos: el empleado SOLO puede crear/subir su propio ticket,
// nunca editarlo despues (el backend lo bloquea, ver
// TesoreriaTicketReembolsoViewSet.get_permissions) - por eso esta pantalla
// no tiene ningun boton de "editar" sobre un ticket ya creado.

const ESTADO_COLOR: Record<TesoreriaTicketEstado, "default" | "warning" | "success" | "error"> = {
  PENDIENTE: "default",
  APROBADO: "warning",
  VINCULADO: "success",
  RECHAZADO: "error",
};

const ESTADO_LABEL: Record<TesoreriaTicketEstado, string> = {
  PENDIENTE: "Pendiente",
  APROBADO: "Aprobado — Tesorería está facturando",
  VINCULADO: "Facturado",
  RECHAZADO: "Rechazado",
};

// "28 de septiembre del 2026" (03/Sep/2026, pedido de Mariana) - formato
// largo en español para las fechas límite mostradas en la pantalla.
function formatearFechaLarga(fechaIso: string): string {
  const [anio, mes, dia] = fechaIso.split("-").map(Number);
  const fecha = new Date(anio, mes - 1, dia);
  const mesNombre = fecha.toLocaleDateString("es-MX", { month: "long" });
  return `${dia} de ${mesNombre} del ${anio}`;
}

function nombreDelMes(fechaIso: string): string {
  const [anio, mes, dia] = fechaIso.split("-").map(Number);
  return new Date(anio, mes - 1, dia).toLocaleDateString("es-MX", { month: "long" });
}

export default function MiCumbresTicketsPage() {
  const theme = useTheme();
  // En celular la tabla no cabe (demasiadas columnas) - se muestra como
  // lista de fichas (Card), una por ticket.
  const esMovil = useMediaQuery(theme.breakpoints.down("sm"));

  const [session, setSession] = useState<SessionUser | null>(null);
  useEffect(() => {
    getSession().then(setSession);
  }, []);

  const [tickets, setTickets] = useState<TesoreriaTicketReembolso[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Fecha de corte real del mes (03/Sep/2026, pedido de Mariana: mostrar
  // el dia/mes/año concreto, no solo describir la regla).
  const [fechaLimite, setFechaLimite] = useState<TesoreriaFechaLimiteReembolso | null>(null);
  useEffect(() => {
    getFechaLimiteReembolso().then(setFechaLimite).catch(() => setFechaLimite(null));
  }, []);

  async function cargar() {
    setLoading(true);
    setError(null);
    try {
      setTickets(await listTicketsReembolso());
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error al cargar tickets");
    } finally {
      setLoading(false);
    }
  }
  useEffect(() => {
    cargar();
  }, []);

  // --- Alta (empleado) ---
  const [openNuevo, setOpenNuevo] = useState(false);
  const [descripcion, setDescripcion] = useState("");
  const [moneda, setMoneda] = useState("MXP");
  const [fechaGasto, setFechaGasto] = useState("");
  const [sociedad, setSociedad] = useState("");
  // Varios conceptos por ticket (03/Sep/2026, minuta punto 1: "solicitar
  // varios conceptos") - tabla editable, mismo patron que las lineas de
  // CotizacionLinea en compras/cotizaciones/page.tsx.
  type ConceptoForm = { descripcion: string; monto: string; categoriaGasto: TesoreriaCategoriaGasto | "" };
  const CONCEPTO_VACIO: ConceptoForm = { descripcion: "", monto: "", categoriaGasto: "" };
  const [conceptos, setConceptos] = useState<ConceptoForm[]>([{ ...CONCEPTO_VACIO }]);

  function actualizarConcepto(index: number, campo: keyof ConceptoForm, valor: string) {
    setConceptos((prev) => {
      const copia = [...prev];
      copia[index] = { ...copia[index], [campo]: valor };
      return copia;
    });
  }
  function agregarConcepto() {
    setConceptos((prev) => [...prev, { ...CONCEPTO_VACIO }]);
  }
  function quitarConcepto(index: number) {
    setConceptos((prev) => (prev.length > 1 ? prev.filter((_, i) => i !== index) : prev));
  }

  // Sociedades a las que el empleado tiene acceso (mismo criterio que
  // filtroSociedad en /tesoreria/contratos) - is_global ve todas, el resto
  // solo las suyas (sociedad_rfcs del EffectiveScope).
  const [sociedades, setSociedades] = useState<GeneralSociedad[]>([]);
  useEffect(() => {
    listSociedades().then(setSociedades).catch(() => setSociedades([]));
  }, []);
  const [archivoTicket, setArchivoTicket] = useState<File | null>(null);
  // Piloto de escaneo (28/Ago/2026, pedido de Mariana): foto tomada con
  // "Tomar foto" pasa por EscanerDocumento antes de quedar como adjunto.
  // 31/Ago/2026 - "Elegir archivo" tambien manda ahi cuando lo elegido es
  // una imagen (no PDF): en escritorio no hay camara, asi que "Tomar
  // foto" ahi ya es solo un selector de archivos disfrazado - el recorte
  // debe poder usarse igual eligiendo una imagen ya existente, en
  // escritorio o celular.
  const [fotoParaEscanear, setFotoParaEscanear] = useState<File | null>(null);
  const [guardando, setGuardando] = useState(false);
  const [errorAlta, setErrorAlta] = useState<string | null>(null);

  function cerrarNuevo() {
    setOpenNuevo(false);
    setDescripcion("");
    setMoneda("MXP");
    setFechaGasto("");
    setSociedad("");
    setConceptos([{ ...CONCEPTO_VACIO }]);
    setArchivoTicket(null);
    setErrorAlta(null);
  }

  async function handleCrearTicket() {
    const conceptosValidos = conceptos.filter((c) => c.descripcion.trim() && c.monto);
    if (!conceptosValidos.length || !fechaGasto) {
      setErrorAlta("Al menos un concepto (descripción + monto) y la fecha del gasto son obligatorios.");
      return;
    }
    setGuardando(true);
    setErrorAlta(null);
    try {
      const nuevo = await crearTicketReembolso({
        descripcion: descripcion || undefined,
        conceptos: conceptosValidos.map((c) => ({
          descripcion: c.descripcion,
          monto: c.monto,
          categoriaGasto: c.categoriaGasto || undefined,
        })),
        moneda,
        fechaGasto,
        sociedad: sociedad || undefined,
      });
      if (archivoTicket) {
        await subirFotoTicket(nuevo.id_ticket, archivoTicket);
      }
      cerrarNuevo();
      await cargar();
    } catch (err) {
      setErrorAlta(err instanceof Error ? err.message : "Error al subir el ticket");
    } finally {
      setGuardando(false);
    }
  }

  return (
    <AppShell>
      <Stack
        direction={{ xs: "column", sm: "row" }}
        justifyContent="space-between"
        alignItems={{ xs: "stretch", sm: "center" }}
        spacing={1.5}
        sx={{ mb: 2 }}
      >
        <Box>
          <Typography variant={esMovil ? "h6" : "h5"}>Tickets de reembolso</Typography>
          <Typography variant="body2" color="text.secondary">
            Pantalla provisional de MiCumbres — sube tu ticket de gasto para que Tesorería lo procese.
          </Typography>
        </Box>
        <Button
          variant="contained"
          size={esMovil ? "small" : "medium"}
          startIcon={<Upload size={18} strokeWidth={1.5} />}
          onClick={() => setOpenNuevo(true)}
        >
          Subir ticket
        </Button>
      </Stack>

      {/* Reglas del ticket (03/Sep/2026, pedido de Mariana: "las reglas van
          afuera" - visibles en la pantalla, no solo dentro del dialogo de
          alta) - mismas reglas que valida reembolso_utils.validar_fecha_limite
          en el backend. */}
      <Alert severity="info" sx={{ mb: 2 }}>
        <Typography variant="body2" component="div">
          <strong>Reglas para el reembolso:</strong>
          <Box component="ul" sx={{ m: 0, pl: 2.5 }}>
            <li>La fecha del gasto no puede ser una fecha futura.</li>
            <li>
              {fechaLimite?.fecha_corte ? (
                <>
                  Este mes se aceptan tickets hasta el <strong>{formatearFechaLarga(fechaLimite.fecha_corte)}</strong>.
                </>
              ) : (
                "No se pueden subir tickets durante los últimos 2 días hábiles del mes (cierre de la contadora)."
              )}
              {fechaLimite?.en_cierre_hoy && " Hoy ya está cerrado; podrás subir de nuevo a partir del día 1 del siguiente mes."}
            </li>
            <li>
              {fechaLimite?.dias_bloqueados?.length === 2 ? (
                <>
                  Un gasto de <strong>{nombreDelMes(fechaLimite.dias_bloqueados[0])}</strong>, llegado a su fecha de
                  corte, solo se aceptará si el ticket está fechado el{" "}
                  <strong>{formatearFechaLarga(fechaLimite.dias_bloqueados[0])}</strong> o el{" "}
                  <strong>{formatearFechaLarga(fechaLimite.dias_bloqueados[1])}</strong> (los días de cierre de ese
                  mes); cualquier fecha anterior a esos días ya no se acepta.
                </>
              ) : (
                "Un gasto de un mes ya cerrado solo se acepta si cayó justo en los días de cierre de ese mes; cualquier fecha anterior ya no se acepta."
              )}
            </li>
            <li>
              La sociedad y el tipo de moneda declarados al crear el ticket son definitivos y no podrán corregirse
              posteriormente. Cualquier error en la sociedad, en la moneda o en la ortografía de la descripción
              invalida el ticket; en tal caso deberá capturarse uno nuevo con los datos correctos.
            </li>
            <li>Debe declararse al menos un concepto por ticket.</li>
          </Box>
        </Typography>
      </Alert>

      {error && (
        <Alert severity="error" sx={{ mb: 2 }}>
          {error}
        </Alert>
      )}

      {loading ? (
        <Box sx={{ display: "flex", justifyContent: "center", py: 4 }}>
          <CircularProgress size={24} />
        </Box>
      ) : tickets.length === 0 ? (
        <Typography variant="body2" color="text.secondary" sx={{ py: 4, textAlign: "center" }}>
          Sin tickets todavía.
        </Typography>
      ) : esMovil ? (
        <Stack spacing={1.5}>
          {tickets.map((t) => (
            <Card key={t.id_ticket} variant="outlined">
              <CardContent sx={{ p: 1.5, "&:last-child": { pb: 1.5 } }}>
                <Stack spacing={0.5}>
                  <Typography variant="subtitle2" sx={{ fontFamily: "var(--font-dm-mono, monospace)" }}>
                    {t.id_ticket}
                  </Typography>
                  <Typography variant="body2">
                    {t.descripcion || t.conceptos.map((c) => c.descripcion).join(", ")}
                  </Typography>
                  {/* El texto del estado es largo ("Aprobado — Tesorería
                      está facturando") - compartiendo fila con el
                      ID/descripción no cabía en pantallas de 320px y
                      forzaba todo a verse apretado (reportado
                      31/Ago/2026). En su propia fila, envuelve solo. */}
                  <Chip
                    size="small"
                    label={ESTADO_LABEL[t.estado]}
                    color={ESTADO_COLOR[t.estado]}
                    sx={{ alignSelf: "flex-start", height: "auto", "& .MuiChip-label": { whiteSpace: "normal", py: 0.5 } }}
                  />
                </Stack>
                <Divider sx={{ my: 1 }} />
                <Stack spacing={0.5}>
                  <Typography variant="body2">
                    <strong>Total ({t.conceptos.length} concepto{t.conceptos.length === 1 ? "" : "s"}):</strong> $
                    {t.monto_total}
                  </Typography>
                  <Typography variant="body2">
                    <strong>Fecha del gasto:</strong> {t.fecha_gasto}
                  </Typography>
                  <Stack direction="row" spacing={2}>
                    {t.link_ticket && (
                      <MuiLink href={t.link_ticket} target="_blank" rel="noopener" variant="body2">
                        Ver ticket
                      </MuiLink>
                    )}
                    {t.link_factura_pdf && (
                      <MuiLink href={t.link_factura_pdf} target="_blank" rel="noopener" variant="body2">
                        Ver factura
                      </MuiLink>
                    )}
                  </Stack>
                </Stack>
              </CardContent>
            </Card>
          ))}
        </Stack>
      ) : (
        <TableContainer component={Paper} variant="outlined">
          <Table size="small">
            <TableHead>
              <TableRow>
                <TableCell>ID</TableCell>
                <TableCell>Conceptos</TableCell>
                <TableCell>Total</TableCell>
                <TableCell>Fecha del gasto</TableCell>
                <TableCell>Estado</TableCell>
                <TableCell>Ticket</TableCell>
                <TableCell>Factura</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {tickets.map((t) => (
                <TableRow key={t.id_ticket} hover>
                  <TableCell>{t.id_ticket}</TableCell>
                  <TableCell sx={{ maxWidth: 240 }}>
                    {t.descripcion || t.conceptos.map((c) => c.descripcion).join(", ")}
                  </TableCell>
                  <TableCell sx={{ fontFamily: "var(--font-dm-mono, monospace)" }}>${t.monto_total}</TableCell>
                  <TableCell>{t.fecha_gasto}</TableCell>
                  <TableCell>
                    <Chip size="small" label={ESTADO_LABEL[t.estado]} color={ESTADO_COLOR[t.estado]} />
                  </TableCell>
                  <TableCell>
                    {t.link_ticket ? (
                      <MuiLink href={t.link_ticket} target="_blank" rel="noopener">
                        Ver
                      </MuiLink>
                    ) : (
                      "—"
                    )}
                  </TableCell>
                  <TableCell>
                    {t.link_factura_pdf ? (
                      <MuiLink href={t.link_factura_pdf} target="_blank" rel="noopener">
                        Ver
                      </MuiLink>
                    ) : (
                      "—"
                    )}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </TableContainer>
      )}

      {/* Alta del empleado - solo crear, nunca editar despues */}
      <Dialog open={openNuevo} onClose={cerrarNuevo} fullWidth maxWidth="sm">
        <DialogTitle sx={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          Ticket de reembolso
          <IconButton size="small" onClick={cerrarNuevo} aria-label="Cerrar">
            <CloseIcon size={18} strokeWidth={1.5} />
          </IconButton>
        </DialogTitle>
        <DialogContent dividers>
          {/* Orden pedido por Mariana 03/Sep/2026: Sociedad -> Fecha+Moneda
              -> Conceptos -> Nota general -> Elegir archivo. */}
          <Stack spacing={2} sx={{ mt: 1 }}>
            {errorAlta && <Alert severity="error">{errorAlta}</Alert>}
            <FormControl fullWidth>
              <InputLabel id="sociedad-ticket-label">Sociedad</InputLabel>
              <Select
                labelId="sociedad-ticket-label"
                label="Sociedad"
                value={sociedad}
                onChange={(e) => setSociedad(e.target.value)}
              >
                <MenuItem value="">
                  <em>Sin especificar</em>
                </MenuItem>
                {sociedades.map((s) => (
                  <MenuItem key={s.rfc} value={s.rfc}>
                    {s.razon_social || s.rfc}
                  </MenuItem>
                ))}
              </Select>
            </FormControl>

            <Stack direction="row" spacing={2}>
              <TextField
                label="Fecha del gasto"
                type="date"
                value={fechaGasto}
                onChange={(e) => setFechaGasto(e.target.value)}
                InputLabelProps={{ shrink: true }}
                inputProps={{ max: new Date().toISOString().slice(0, 10) }}
                fullWidth
              />
              <FormControl sx={{ minWidth: 100 }}>
                <InputLabel id="moneda-label">Moneda</InputLabel>
                <Select
                  labelId="moneda-label"
                  label="Moneda"
                  value={moneda}
                  onChange={(e) => setMoneda(e.target.value)}
                >
                  <MenuItem value="MXP">MXP</MenuItem>
                  <MenuItem value="USD">USD</MenuItem>
                  <MenuItem value="EUR">EUR</MenuItem>
                </Select>
              </FormControl>
            </Stack>

            {/* Conceptos (03/Sep/2026, minuta punto 1: "solicitar varios
                conceptos") - tabla editable en pantallas >= sm; en celular
                se reemplaza por tarjetas apiladas (una fila con 3 campos +
                borrar no cabe comoda en un telefono), mismo patron que
                compras/cotizaciones/page.tsx y tesoreria/flujos/page.tsx. */}
            <Typography variant="subtitle2">Conceptos</Typography>
            <Box sx={{ display: { xs: "none", sm: "block" } }}>
              <TableContainer component={Paper} variant="outlined">
                <Table size="small">
                  <TableHead>
                    <TableRow>
                      <TableCell>Descripción</TableCell>
                      <TableCell sx={{ width: 110 }}>Monto</TableCell>
                      <TableCell sx={{ width: 160 }}>Categoría</TableCell>
                      <TableCell sx={{ width: 40 }} />
                    </TableRow>
                  </TableHead>
                  <TableBody>
                    {conceptos.map((c, index) => (
                      <TableRow key={index}>
                        <TableCell>
                          <TextField
                            size="small"
                            variant="standard"
                            value={c.descripcion}
                            onChange={(e) => actualizarConcepto(index, "descripcion", e.target.value)}
                            fullWidth
                          />
                        </TableCell>
                        <TableCell>
                          <TextField
                            size="small"
                            variant="standard"
                            type="number"
                            value={c.monto}
                            onChange={(e) => actualizarConcepto(index, "monto", e.target.value)}
                            fullWidth
                          />
                        </TableCell>
                        <TableCell>
                          <Select
                            size="small"
                            variant="standard"
                            value={c.categoriaGasto}
                            onChange={(e) => actualizarConcepto(index, "categoriaGasto", e.target.value)}
                            displayEmpty
                            fullWidth
                          >
                            <MenuItem value="">
                              <em>—</em>
                            </MenuItem>
                            {Object.entries(CATEGORIA_GASTO_LABELS).map(([valor, label]) => (
                              <MenuItem key={valor} value={valor}>
                                {label}
                              </MenuItem>
                            ))}
                          </Select>
                        </TableCell>
                        <TableCell>
                          <IconButton size="small" onClick={() => quitarConcepto(index)} disabled={conceptos.length === 1}>
                            <Trash2 size={14} strokeWidth={2} />
                          </IconButton>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </TableContainer>
            </Box>

            {/* Tarjetas apiladas - solo celular (xs), ver comentario arriba. */}
            <Stack spacing={1.5} sx={{ display: { xs: "flex", sm: "none" } }}>
              {conceptos.map((c, index) => (
                <Paper key={index} variant="outlined" sx={{ p: 1.5 }}>
                  <Stack direction="row" justifyContent="flex-end">
                    <IconButton size="small" onClick={() => quitarConcepto(index)} disabled={conceptos.length === 1}>
                      <Trash2 size={14} strokeWidth={2} />
                    </IconButton>
                  </Stack>
                  <Stack spacing={1}>
                    <TextField
                      label="Descripción"
                      size="small"
                      value={c.descripcion}
                      onChange={(e) => actualizarConcepto(index, "descripcion", e.target.value)}
                      fullWidth
                    />
                    <TextField
                      label="Monto"
                      size="small"
                      type="number"
                      value={c.monto}
                      onChange={(e) => actualizarConcepto(index, "monto", e.target.value)}
                      fullWidth
                    />
                    <FormControl fullWidth size="small">
                      <InputLabel id={`categoria-concepto-${index}`}>Categoría</InputLabel>
                      <Select
                        labelId={`categoria-concepto-${index}`}
                        label="Categoría"
                        value={c.categoriaGasto}
                        onChange={(e) => actualizarConcepto(index, "categoriaGasto", e.target.value)}
                      >
                        <MenuItem value="">
                          <em>Sin especificar</em>
                        </MenuItem>
                        {Object.entries(CATEGORIA_GASTO_LABELS).map(([valor, label]) => (
                          <MenuItem key={valor} value={valor}>
                            {label}
                          </MenuItem>
                        ))}
                      </Select>
                    </FormControl>
                  </Stack>
                </Paper>
              ))}
            </Stack>

            <Button size="small" startIcon={<Plus size={14} strokeWidth={2} />} onClick={agregarConcepto} sx={{ alignSelf: "flex-start" }}>
              Agregar concepto
            </Button>

            <TextField
              label="Nota general del ticket (opcional)"
              value={descripcion}
              onChange={(e) => setDescripcion(e.target.value)}
              multiline
              minRows={1}
              fullWidth
            />

            {/* "Tomar foto" con `capture` solo abre la camara directo en
                celular (pedido de Mariana 27/Ago/2026) - en escritorio no
                hay camara que abrir, asi que el boton quedaba ahi como un
                selector de archivos redundante con "Elegir archivo". Desde
                que "Elegir archivo" tambien manda las imagenes al recorte
                (31/Ago/2026 - ver su onChange: la distincion real ya no es
                camara-vs-archivo sino imagen-vs-PDF), "Tomar foto" ya no
                aporta nada en escritorio - se oculta con esMovil. */}
            <Stack direction={{ xs: "column", sm: "row" }} spacing={1}>
              {esMovil && (
                <Button component="label" variant="outlined" startIcon={<Camera size={16} strokeWidth={1.5} />}>
                  Tomar foto
                  <input
                    type="file"
                    hidden
                    accept="image/*"
                    capture="environment"
                    onChange={(e) => {
                      const f = e.target.files?.[0] ?? null;
                      setFotoParaEscanear(f);
                      e.target.value = "";
                    }}
                  />
                </Button>
              )}
              <Button component="label" variant="outlined" startIcon={<Upload size={16} strokeWidth={1.5} />}>
                Elegir archivo
                <input
                  type="file"
                  hidden
                  accept="image/*,application/pdf"
                  onChange={(e) => {
                    const f = e.target.files?.[0] ?? null;
                    // Un PDF no tiene esquinas que recortar - solo las
                    // imagenes pasan por el escaner, igual que "Tomar foto".
                    if (f && f.type.startsWith("image/")) {
                      setFotoParaEscanear(f);
                    } else {
                      setArchivoTicket(f);
                    }
                    e.target.value = "";
                  }}
                />
              </Button>
            </Stack>
            {archivoTicket && (
              <Typography variant="caption" color="text.secondary">
                Adjunto: {archivoTicket.name}
              </Typography>
            )}
          </Stack>
        </DialogContent>
        <DialogActions>
          <Button onClick={cerrarNuevo}>Cancelar</Button>
          <Button variant="contained" onClick={handleCrearTicket} disabled={guardando}>
            {guardando ? <CircularProgress size={20} color="inherit" /> : "Subir"}
          </Button>
        </DialogActions>
      </Dialog>

      <EscanerDocumento
        open={!!fotoParaEscanear}
        archivo={fotoParaEscanear}
        onCancelar={() => setFotoParaEscanear(null)}
        onConfirmar={(archivo) => {
          setArchivoTicket(archivo);
          setFotoParaEscanear(null);
        }}
      />
    </AppShell>
  );
}
