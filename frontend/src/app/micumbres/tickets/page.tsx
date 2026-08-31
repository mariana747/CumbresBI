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
import { Camera, Upload, X as CloseIcon } from "lucide-react";
import AppShell from "@/components/AppShell";
import EscanerDocumento from "@/components/EscanerDocumento";
import { getSession, SessionUser } from "@/lib/auth";
import { GeneralSociedad, listSociedades } from "@/lib/iam";
import {
  crearTicketReembolso,
  CATEGORIA_GASTO_LABELS,
  CENTRO_COSTO_LABELS,
  listTicketsReembolso,
  subirFotoTicket,
  TesoreriaCategoriaGasto,
  TesoreriaCentroCosto,
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
  const [monto, setMonto] = useState("");
  const [moneda, setMoneda] = useState("MXP");
  const [fechaGasto, setFechaGasto] = useState("");
  const [sociedad, setSociedad] = useState("");
  const [centro, setCentro] = useState<TesoreriaCentroCosto | "">("");
  const [categoriaGasto, setCategoriaGasto] = useState<TesoreriaCategoriaGasto | "">("");

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
    setMonto("");
    setMoneda("MXP");
    setFechaGasto("");
    setSociedad("");
    setCentro("");
    setCategoriaGasto("");
    setArchivoTicket(null);
    setErrorAlta(null);
  }

  async function handleCrearTicket() {
    if (!descripcion || !monto || !fechaGasto) {
      setErrorAlta("Descripción, monto y fecha del gasto son obligatorios.");
      return;
    }
    setGuardando(true);
    setErrorAlta(null);
    try {
      const nuevo = await crearTicketReembolso({
        descripcion,
        monto,
        moneda,
        fechaGasto,
        sociedad: sociedad || undefined,
        centro: centro || undefined,
        categoriaGasto: categoriaGasto || undefined,
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
                  <Typography variant="body2">{t.descripcion}</Typography>
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
                    <strong>Monto:</strong> ${t.monto}
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
                <TableCell>Descripción</TableCell>
                <TableCell>Monto</TableCell>
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
                  <TableCell sx={{ maxWidth: 240 }}>{t.descripcion}</TableCell>
                  <TableCell sx={{ fontFamily: "var(--font-dm-mono, monospace)" }}>${t.monto}</TableCell>
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
          Subir ticket de reembolso
          <IconButton size="small" onClick={cerrarNuevo} aria-label="Cerrar">
            <CloseIcon size={18} strokeWidth={1.5} />
          </IconButton>
        </DialogTitle>
        <DialogContent dividers>
          <Stack spacing={2} sx={{ mt: 1 }}>
            {errorAlta && <Alert severity="error">{errorAlta}</Alert>}
            <TextField
              label="Descripción del gasto"
              value={descripcion}
              onChange={(e) => setDescripcion(e.target.value)}
              multiline
              minRows={2}
              fullWidth
            />
            <Stack direction="row" spacing={2}>
              <TextField
                label="Monto"
                type="number"
                value={monto}
                onChange={(e) => setMonto(e.target.value)}
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
            <TextField
              label="Fecha del gasto"
              type="date"
              value={fechaGasto}
              onChange={(e) => setFechaGasto(e.target.value)}
              InputLabelProps={{ shrink: true }}
              fullWidth
            />
            <FormControl fullWidth>
              <InputLabel id="sociedad-ticket-label">Sociedad (empresa a la que se carga el gasto)</InputLabel>
              <Select
                labelId="sociedad-ticket-label"
                label="Sociedad (empresa a la que se carga el gasto)"
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
            <FormControl fullWidth>
              <InputLabel id="categoria-gasto-label">Categoría de gasto</InputLabel>
              <Select
                labelId="categoria-gasto-label"
                label="Categoría de gasto"
                value={categoriaGasto}
                onChange={(e) => setCategoriaGasto(e.target.value as TesoreriaCategoriaGasto | "")}
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
            <FormControl fullWidth>
              <InputLabel id="centro-costo-label">Centro de costo</InputLabel>
              <Select
                labelId="centro-costo-label"
                label="Centro de costo"
                value={centro}
                onChange={(e) => setCentro(e.target.value as TesoreriaCentroCosto | "")}
              >
                <MenuItem value="">
                  <em>Sin especificar</em>
                </MenuItem>
                {Object.entries(CENTRO_COSTO_LABELS).map(([valor, label]) => (
                  <MenuItem key={valor} value={valor}>
                    {label}
                  </MenuItem>
                ))}
              </Select>
            </FormControl>
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
