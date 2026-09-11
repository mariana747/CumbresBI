"use client";

import { useEffect, useMemo, useState } from "react";
import {
  Alert,
  Box,
  Button,
  Card,
  CardContent,
  Chip,
  CircularProgress,
  Dialog,
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
  Typography,
  useMediaQuery,
  useTheme,
} from "@mui/material";
import { CheckCircle2, Eye, ReceiptText as TicketIcon, Sparkles, Upload, X as CloseIcon, XCircle } from "lucide-react";
import DocumentoPreviewDialog from "@/components/DocumentoPreviewDialog";
import FiltrosBar from "@/components/FiltrosBar";
import MotorDocumentalDialog, { MotorDocumentalContexto } from "@/components/MotorDocumentalDialog";
import { SessionUser } from "@/lib/auth";
import { GeneralSociedad, IamUser, listSociedades, listUsers } from "@/lib/iam";
import {
  aprobarTicket,
  urlVerFactura,
  urlVerTicket,
  CATEGORIA_GASTO_LABELS,
  listTicketsReembolso,
  rechazarTicket,
  subirFacturaTicket,
  vincularFacturaTicket,
  TesoreriaCategoriaGasto,
  TesoreriaTicketEstado,
  TesoreriaTicketReembolso,
} from "@/lib/miCumbres";
import { createFactura, TESORERIA_CAMPOS_CONFIRMABLES_NUEVA } from "@/lib/tesoreria";

// Revision de Tesoreria sobre los tickets de reembolso que suben los
// empleados desde MiCumbres (27/Ago/2026, pantalla PROVISIONAL - ver
// memoria de sesion "micumbres-tickets-reembolso-provisional"). Vive como
// pestaña dentro de /tesoreria/facturas (pedido de Mariana: la revision
// debe estar donde Tesoreria ya trabaja, no en MiCumbres).
//
// Flujo real (pedido explicito de Mariana, 27/Ago/2026, orden final:
// "verificar con Gemini, muestra los datos, se aprueba, luego se sube
// factura"): PENDIENTE -> el Motor Documental analiza el comprobante/foto
// que ya subio el empleado (`tesoreria.ticket_gasto`, sobre
// link_ticket/drive_file_id_ticket) y muestra los datos extraidos -> el
// analista los revisa y confirma (nunca automatico sin humano, regla no
// negociable del proyecto), lo que aprueba el ticket -> ya APROBADO, sube
// el PDF real de la factura (staging) -> Motor Documental la valida
// (`compras.factura_proveedor`, chip "Coincide"/"No coincide") y extrae
// sus datos -> el analista confirma de nuevo -> se crea la TesoreriaFactura
// real y se liga al ticket en un solo paso -> VINCULADO. Rechazar sigue
// disponible en PENDIENTE para descartar un ticket obviamente invalido sin
// llegar a verificar nada.
const ESTADO_COLOR: Record<TesoreriaTicketEstado, "default" | "warning" | "success" | "error"> = {
  PENDIENTE: "default",
  APROBADO: "warning",
  VINCULADO: "success",
  RECHAZADO: "error",
};

const ESTADO_LABEL: Record<TesoreriaTicketEstado, string> = {
  PENDIENTE: "Pendiente",
  APROBADO: "Aprobado — falta facturar",
  VINCULADO: "Facturado",
  RECHAZADO: "Rechazado",
};

// snake_case (como vienen extracted_data/campos del Motor Documental,
// espejo de los nombres de columna de Django) -> camelCase (como los pide
// FacturaInput en lib/tesoreria.ts) - solo para el subconjunto de
// TESORERIA_CAMPOS_CONFIRMABLES_NUEVA, no un helper generico de sobra.
function snakeACamel(campo: string): string {
  return campo.replace(/_([a-z])/g, (_, letra) => letra.toUpperCase());
}

export default function TicketsReembolsoAdminPanel({ session }: { session: SessionUser | null }) {
  // 07/Sep/2026, "hay que hacerlo responsivo" - mismo patron ya usado en
  // micumbres/tickets/page.tsx: el dialogo de detalle pasa a pantalla
  // completa en celular y los botones se apilan en vez de desbordar.
  const theme = useTheme();
  const esMovil = useMediaQuery(theme.breakpoints.down("sm"));

  const [tickets, setTickets] = useState<TesoreriaTicketReembolso[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  // Buscador (11/Sep/2026, "usa los componentes reutilizables" - esta
  // pantalla nunca tuvo FiltrosBar, se adopta aqui junto con el filtro de
  // categoria de gasto en vez de dejar un Select suelto).
  const [search, setSearch] = useState("");

  async function cargar() {
    setLoading(true);
    setError(null);
    try {
      setTickets(await listTicketsReembolso(search || undefined));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error al cargar tickets");
    } finally {
      setLoading(false);
    }
  }
  useEffect(() => {
    const timeout = setTimeout(cargar, 300);
    return () => clearTimeout(timeout);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [search]);

  // Filtro por Categoria de gasto (11/Sep/2026, "filtro en las 4 pantallas")
  // - la categoria vive en cada concepto del ticket, no en el ticket
  // mismo (un ticket puede tener varios conceptos con categorias
  // distintas); se filtra "algun concepto de este ticket tiene esta
  // categoria", mismo criterio que TesoreriaTicketReembolsoViewSet.get_queryset.
  const [filtroCategoriaGasto, setFiltroCategoriaGasto] = useState<TesoreriaCategoriaGasto | "">("");
  const ticketsFiltrados = useMemo(
    () =>
      filtroCategoriaGasto
        ? tickets.filter((t) => t.conceptos.some((c) => c.categoria_gasto === filtroCategoriaGasto))
        : tickets,
    [tickets, filtroCategoriaGasto]
  );

  // El ticket solo guarda el RFC de la sociedad (referencia laxa, mismo
  // criterio que TesoreriaContrato.sociedad) - mostrarlo crudo no le dice
  // nada al analista, necesita ver la razon social (07/Sep/2026).
  const [sociedades, setSociedades] = useState<GeneralSociedad[]>([]);
  useEffect(() => {
    listSociedades().then(setSociedades).catch(() => setSociedades([]));
  }, []);
  function nombreSociedad(rfc: string | null): string {
    if (!rfc) return "—";
    return sociedades.find((s) => s.rfc === rfc)?.razon_social || rfc;
  }

  // id_empleado es el identity_user_id crudo (CharField plano, no FK real
  // a rrhh_empleados - ver docstring de TesoreriaTicketReembolso, todavia
  // no existe RRHH) - pero SI coincide con IamUser.user_id porque sale del
  // mismo JWT, asi que se puede resolver a un nombre real via el
  // directorio de iam-service (07/Sep/2026, "debe ser el nombre real").
  const [empleados, setEmpleados] = useState<IamUser[]>([]);
  useEffect(() => {
    listUsers().then(setEmpleados).catch(() => setEmpleados([]));
  }, []);
  function nombreEmpleado(idEmpleado: string): string {
    const usuario = empleados.find((u) => u.user_id === idEmpleado);
    return usuario?.display_name || usuario?.primary_email || idEmpleado;
  }

  const [ticketAbierto, setTicketAbierto] = useState<TesoreriaTicketReembolso | null>(null);
  // Preview embebido de "Ver ticket"/"Ver factura" (04/Sep/2026, "usa lo
  // mismo que en pld") - mismo criterio que micumbres/tickets/page.tsx.
  const [previewDoc, setPreviewDoc] = useState<{ ticket: TesoreriaTicketReembolso; tipo: "ticket" | "factura" } | null>(
    null
  );
  // Dos dialogos del Motor Documental distintos (27/Ago/2026): uno para
  // verificar el comprobante del empleado ANTES de aprobar, otro para
  // validar la factura real YA aprobado - cada uno con su propio contexto
  // (carpeta/expectedDocumentType/onConfirmar), ver contextoVerificacion y
  // contextoFactura mas abajo.
  const [motorVerificacionAbierto, setMotorVerificacionAbierto] = useState(false);
  const [motorFacturaAbierto, setMotorFacturaAbierto] = useState(false);
  const [errorDetalle, setErrorDetalle] = useState<string | null>(null);
  const [procesando, setProcesando] = useState(false);
  // Campos ya confirmados por el Motor Documental para el ticket abierto
  // (07/Sep/2026) - null hasta que el analista confirma la extraccion; a
  // partir de ahi habilita el boton "Aprobar" (antes se aprobaba solo al
  // confirmar, ahora el analista decide aparte, ya con la comparacion a la
  // vista). Se reinicia cada vez que se abre un ticket distinto.
  const [verificacionCampos, setVerificacionCampos] = useState<Record<string, unknown> | null>(null);
  useEffect(() => {
    setVerificacionCampos(null);
  }, [ticketAbierto?.id_ticket]);

  async function handleRechazar() {
    if (!ticketAbierto) return;
    setProcesando(true);
    setErrorDetalle(null);
    try {
      const actualizado = await rechazarTicket(ticketAbierto.id_ticket, undefined, session?.user_id);
      setTicketAbierto(actualizado);
      await cargar();
    } catch (err) {
      setErrorDetalle(err instanceof Error ? err.message : "Error al rechazar el ticket");
    } finally {
      setProcesando(false);
    }
  }

  async function handleSubirFactura(archivo: File) {
    if (!ticketAbierto) return;
    setErrorDetalle(null);
    try {
      const actualizado = await subirFacturaTicket(ticketAbierto.id_ticket, archivo);
      setTicketAbierto(actualizado);
      await cargar();
    } catch (err) {
      setErrorDetalle(err instanceof Error ? err.message : "Error al subir la factura");
    }
  }

  // Al confirmar la verificacion del comprobante del empleado: no hay nada
  // que guardar de esos campos (comercio_nombre/monto_total/etc. no tienen
  // columna propia, solo sirven para que la IA los compare contra
  // descripcion/monto/fecha_gasto ya declarados por el empleado - ver
  // registroActual en contextoVerificacion). El Motor Documental ya marco
  // ahi mismo cualquier discrepancia (07/Sep/2026, "si hay algun error lo
  // marcaremos") antes de que el analista llegue a este punto; "Confirmar"
  // ya NO aprueba solo - el analista vio el comparativo y decide Aprobar o
  // Rechazar por separado en el detalle del ticket (mismos dos botones de
  // siempre). Aqui solo se guarda el resumen de lo extraido/comparado en
  // comentarios, para que quede trazado que se reviso y con que datos.
  async function handleConfirmarVerificacion(campos: Record<string, unknown>) {
    if (!ticketAbierto) return;
    setVerificacionCampos(campos);
    setMotorVerificacionAbierto(false);
  }

  async function handleAprobar() {
    if (!ticketAbierto) return;
    setProcesando(true);
    setErrorDetalle(null);
    try {
      const comentarios = verificacionCampos
        ? `Verificado con Motor Documental: ${JSON.stringify(verificacionCampos)}`
        : undefined;
      const actualizado = await aprobarTicket(ticketAbierto.id_ticket, comentarios, session?.user_id);
      setTicketAbierto(actualizado);
      await cargar();
    } catch (err) {
      setErrorDetalle(err instanceof Error ? err.message : "Error al aprobar el ticket");
    } finally {
      setProcesando(false);
    }
  }

  // Al confirmar la extraccion de la factura real (ya APROBADO): crea la
  // factura formal con los campos revisados por el analista y de una vez
  // liga el ticket (vincular_factura exige estado=APROBADO, ya lo esta en
  // este punto). Un solo paso desde el punto de vista del analista:
  // "Confirmar y guardar" ya deja todo facturado y vinculado.
  async function handleConfirmarFactura(campos: Record<string, unknown>) {
    if (!ticketAbierto) return;
    const params: Record<string, unknown> = {};
    for (const [campo, valor] of Object.entries(campos)) {
      params[snakeACamel(campo)] = valor;
    }
    const factura = await createFactura(params as Parameters<typeof createFactura>[0]);
    const actualizado = await vincularFacturaTicket(ticketAbierto.id_ticket, factura.timbre_uuid, session?.user_id);
    setTicketAbierto(actualizado);
    await cargar();
  }

  // Analiza el mismo archivo que ya subio el empleado (link_ticket) - vive
  // en la misma carpeta que despues va a recibir la factura real, solo
  // que primero (todavia no hay PDF de factura en esta etapa).
  const contextoVerificacion: MotorDocumentalContexto | null = ticketAbierto
    ? {
        etiqueta: `comprobante del ticket ${ticketAbierto.id_ticket}`,
        servicioSolicitante: "tesoreria-service",
        carpeta: `Tesoreria/Facturas/TicketsReembolso/${ticketAbierto.id_ticket}`,
        permKey: "tesoreria.editar",
        expectedDocumentType: "tesoreria.ticket_gasto",
        camposConfirmables: ["comercio_nombre", "fecha_gasto", "monto_total", "moneda", "concepto"],
        // Lo que el empleado ya declaro al subir el ticket (07/Sep/2026) -
        // el Motor Documental compara contra esto y marca discrepancias
        // (tolerante a formato de monto/fecha y typos menores, ver
        // MotorDocumentalDialog::compararConExpediente). "comercio_nombre"
        // se queda fuera a proposito: el empleado nunca lo declara, no hay
        // con que comparar.
        registroActual: {
          fecha_gasto: ticketAbierto.fecha_gasto,
          monto_total: ticketAbierto.monto_total,
          moneda: ticketAbierto.moneda,
          concepto: ticketAbierto.descripcion || ticketAbierto.conceptos.map((c) => c.descripcion).join(", "),
        },
        onConfirmar: handleConfirmarVerificacion,
      }
    : null;

  const contextoFactura: MotorDocumentalContexto | null = ticketAbierto
    ? {
        etiqueta: `ticket ${ticketAbierto.id_ticket}`,
        servicioSolicitante: "tesoreria-service",
        carpeta: `Tesoreria/Facturas/TicketsReembolso/${ticketAbierto.id_ticket}`,
        permKey: "tesoreria.editar",
        // Fijo (no adivinado por nombre de archivo) - el punto es
        // justamente validar que SI sea una factura real antes de
        // aceptar el ticket como facturado (pedido de Mariana 27/Ago/2026:
        // "podrían meter un ticket que no lo es"). Si Gemini marca
        // matches_expected_type=false o trae validation_errors, el
        // dialogo ya lo muestra como advertencia — el analista decide si
        // igual confirma o rechaza el ticket en vez de facturarlo.
        expectedDocumentType: "compras.factura_proveedor",
        camposConfirmables: TESORERIA_CAMPOS_CONFIRMABLES_NUEVA,
        onConfirmar: handleConfirmarFactura,
      }
    : null;

  return (
    <>
      <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
        Tickets de Reembolso subidos por empleados desde MiCumbres — verifica el comprobante con el Motor Documental
        antes de aprobar (o recházalos directo si son obviamente inválidos), y factura los ya aprobados.
      </Typography>

      {error && (
        <Alert severity="error" sx={{ mb: 2 }}>
          {error}
        </Alert>
      )}

      <FiltrosBar
        search={search}
        onSearchChange={setSearch}
        searchPlaceholder="Buscar por ID de ticket o descripción..."
      >
        <FormControl size="small" fullWidth>
          <InputLabel id="filtro-categoria-gasto-reembolsos-label">Categoría de gasto</InputLabel>
          <Select
            labelId="filtro-categoria-gasto-reembolsos-label"
            label="Categoría de gasto"
            value={filtroCategoriaGasto}
            onChange={(e) => setFiltroCategoriaGasto(e.target.value as TesoreriaCategoriaGasto | "")}
          >
            <MenuItem value="">
              <em>Todas</em>
            </MenuItem>
            {(Object.keys(CATEGORIA_GASTO_LABELS) as TesoreriaCategoriaGasto[]).map((c) => (
              <MenuItem key={c} value={c}>
                {CATEGORIA_GASTO_LABELS[c]}
              </MenuItem>
            ))}
          </Select>
        </FormControl>
      </FiltrosBar>

      {loading ? (
        <Box sx={{ display: "flex", justifyContent: "center", py: 4 }}>
          <CircularProgress size={24} />
        </Box>
      ) : ticketsFiltrados.length === 0 ? (
        <Typography variant="body2" color="text.secondary" sx={{ py: 4, textAlign: "center" }}>
          Sin tickets todavía.
        </Typography>
      ) : esMovil ? (
        // Tarjetas apiladas en celular (07/Sep/2026, "no esta en tarjetas
        // apiladas") - mismo patron que micumbres/tickets/page.tsx: la
        // tabla de 9 columnas no cabe comoda en una pantalla angosta.
        <Stack spacing={1.5}>
          {ticketsFiltrados.map((t) => (
            <Card key={t.id_ticket} variant="outlined">
              <CardContent sx={{ p: 1.5, "&:last-child": { pb: 1.5 } }}>
                <Stack direction="row" justifyContent="space-between" alignItems="flex-start">
                  <Stack spacing={0.5} sx={{ flex: 1, minWidth: 0 }}>
                    <Typography variant="subtitle2" sx={{ fontFamily: "var(--font-dm-mono, monospace)" }}>
                      {t.id_ticket}
                    </Typography>
                    <Typography variant="caption" color="text.secondary">
                      {nombreEmpleado(t.id_empleado)}
                    </Typography>
                    <Typography variant="body2">
                      {t.descripcion || t.conceptos.map((c) => c.descripcion).join(", ")}
                    </Typography>
                  </Stack>
                  <IconButton
                    size="small"
                    aria-label="Ver"
                    onClick={() => {
                      setTicketAbierto(t);
                      setErrorDetalle(null);
                    }}
                  >
                    <Eye size={14} strokeWidth={1.5} />
                  </IconButton>
                </Stack>
                <Chip
                  size="small"
                  label={ESTADO_LABEL[t.estado]}
                  color={ESTADO_COLOR[t.estado]}
                  sx={{ alignSelf: "flex-start", mt: 0.5 }}
                />
                <Divider sx={{ my: 1 }} />
                <Stack spacing={0.5}>
                  <Typography variant="body2">
                    <strong>Monto:</strong> ${t.monto_total}
                  </Typography>
                  <Typography variant="body2">
                    <strong>Fecha del gasto:</strong> {t.fecha_gasto}
                  </Typography>
                  <Stack direction="row" spacing={2}>
                    {t.link_ticket && (
                      <MuiLink
                        component="button"
                        variant="body2"
                        onClick={() => setPreviewDoc({ ticket: t, tipo: "ticket" })}
                        sx={{ display: "inline-flex", alignItems: "center", gap: 0.5 }}
                      >
                        <TicketIcon size={14} strokeWidth={1.5} /> Ver ticket
                      </MuiLink>
                    )}
                    {(t.factura_folio || t.link_factura_pdf) && (
                      <MuiLink
                        component="button"
                        variant="body2"
                        onClick={() => setPreviewDoc({ ticket: t, tipo: "factura" })}
                      >
                        {t.factura_folio ? `Folio ${t.factura_folio}` : "Ver factura"}
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
                <TableCell>Empleado</TableCell>
                <TableCell>Descripción</TableCell>
                <TableCell>Monto</TableCell>
                <TableCell>Fecha del gasto</TableCell>
                <TableCell>Estado</TableCell>
                <TableCell align="center">Ticket</TableCell>
                <TableCell>Factura</TableCell>
                <TableCell align="right">Acciones</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {ticketsFiltrados.map((t) => (
                <TableRow key={t.id_ticket} hover>
                  <TableCell>{t.id_ticket}</TableCell>
                  <TableCell>{nombreEmpleado(t.id_empleado)}</TableCell>
                  <TableCell sx={{ maxWidth: 240 }}>
                    {t.descripcion || t.conceptos.map((c) => c.descripcion).join(", ")}
                  </TableCell>
                  <TableCell sx={{ fontFamily: "var(--font-dm-mono, monospace)" }}>${t.monto_total}</TableCell>
                  <TableCell>{t.fecha_gasto}</TableCell>
                  <TableCell>
                    <Chip size="small" label={ESTADO_LABEL[t.estado]} color={ESTADO_COLOR[t.estado]} />
                  </TableCell>
                  <TableCell align="center">
                    {t.link_ticket ? (
                      <IconButton size="small" aria-label="Ver ticket" onClick={() => setPreviewDoc({ ticket: t, tipo: "ticket" })}>
                        <TicketIcon size={14} strokeWidth={1.5} />
                      </IconButton>
                    ) : (
                      "—"
                    )}
                  </TableCell>
                  <TableCell>
                    {t.factura_folio
                      ? `Folio ${t.factura_folio}`
                      : t.link_factura_pdf
                        ? (
                          <MuiLink component="button" onClick={() => setPreviewDoc({ ticket: t, tipo: "factura" })}>
                            PDF subido
                          </MuiLink>
                        )
                        : "—"}
                  </TableCell>
                  <TableCell align="right">
                    <IconButton
                      size="small"
                      aria-label="Ver"
                      onClick={() => {
                        setTicketAbierto(t);
                        setErrorDetalle(null);
                      }}
                    >
                      <Eye size={14} strokeWidth={1.5} />
                    </IconButton>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </TableContainer>
      )}

      <Dialog
        open={!!ticketAbierto}
        onClose={() => setTicketAbierto(null)}
        fullWidth
        maxWidth="sm"
        fullScreen={esMovil}
      >
        {ticketAbierto && (
          <>
            <DialogTitle sx={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              Ticket {ticketAbierto.id_ticket}
              <IconButton size="small" onClick={() => setTicketAbierto(null)} aria-label="Cerrar">
                <CloseIcon size={18} strokeWidth={1.5} />
              </IconButton>
            </DialogTitle>
            <DialogContent dividers>
              <Stack spacing={2}>
                {errorDetalle && <Alert severity="error">{errorDetalle}</Alert>}
                <Chip
                  size="small"
                  label={ESTADO_LABEL[ticketAbierto.estado]}
                  color={ESTADO_COLOR[ticketAbierto.estado]}
                  sx={{ alignSelf: "flex-start" }}
                />
                <Typography variant="body2">
                  <strong>Empleado:</strong> {nombreEmpleado(ticketAbierto.id_empleado)}
                </Typography>
                {ticketAbierto.descripcion && (
                  <Typography variant="body2">
                    <strong>Nota:</strong> {ticketAbierto.descripcion}
                  </Typography>
                )}
                <Typography variant="body2">
                  <strong>Total:</strong> ${ticketAbierto.monto_total} {ticketAbierto.moneda} —{" "}
                  {ticketAbierto.fecha_gasto}
                </Typography>
                <Typography variant="body2">
                  <strong>Sociedad:</strong> {nombreSociedad(ticketAbierto.sociedad)}
                </Typography>
                {ticketAbierto.autorizado_por && (
                  <Typography variant="body2">
                    <strong>Autorizado por:</strong> {ticketAbierto.autorizado_por}{" "}
                    ({ticketAbierto.fecha_autorizacion})
                  </Typography>
                )}
           
                <Typography variant="subtitle2">Conceptos</Typography>
                <TableContainer component={Paper} variant="outlined">
                  <Table size="small">
                    <TableHead>
                      <TableRow>
                        <TableCell>Descripción</TableCell>
                        <TableCell align="right">Monto</TableCell>
                        <TableCell>Categoría</TableCell>
                      </TableRow>
                    </TableHead>
                    <TableBody>
                      {ticketAbierto.conceptos.map((c) => (
                        <TableRow key={c.id_concepto}>
                          <TableCell>{c.descripcion}</TableCell>
                          <TableCell align="right">${c.monto}</TableCell>
                          <TableCell>{c.categoria_gasto ? CATEGORIA_GASTO_LABELS[c.categoria_gasto] : "—"}</TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </TableContainer>
      
                <Stack direction="row" spacing={1} flexWrap="wrap" useFlexGap>
                  {ticketAbierto.link_ticket && (
                    <Button
                      size="small"
                      variant="outlined"
                      fullWidth={esMovil}
                      startIcon={<TicketIcon size={14} strokeWidth={1.5} />}
                      onClick={() => setPreviewDoc({ ticket: ticketAbierto, tipo: "ticket" })}
                    >
                      Ver ticket
                    </Button>
                  )}
                  {ticketAbierto.link_factura_pdf && (
                    <Button
                      size="small"
                      variant="outlined"
                      fullWidth={esMovil}
                      onClick={() => setPreviewDoc({ ticket: ticketAbierto, tipo: "factura" })}
                    >
                      Ver factura
                    </Button>
                  )}
                </Stack>

                {ticketAbierto.estado === "PENDIENTE" && (
                  <>
                    <Typography variant="caption" color="text.secondary">
                      {verificacionCampos
                        ? "Ya se verificó con el Motor Documental — revisa el comparativo arriba y decide."
                        : "No se puede aprobar hasta que el Motor Documental verifique el comprobante subido por el empleado."}
                    </Typography>

                    <Stack direction={{ xs: "column", sm: "row" }} spacing={1}>
                      <Button
                        variant={verificacionCampos ? "outlined" : "contained"}
                        fullWidth={esMovil}
                        startIcon={<Sparkles size={16} strokeWidth={1.5} />}
                        onClick={() => setMotorVerificacionAbierto(true)}
                        disabled={!ticketAbierto.link_ticket}
                      >
                        {verificacionCampos ? "Ver verificación de nuevo" : "Verificar con el Motor Documental"}
                      </Button>
                      {verificacionCampos && (
                        <Button
                          variant="contained"
                          color="success"
                          fullWidth={esMovil}
                          startIcon={<CheckCircle2 size={16} strokeWidth={1.5} />}
                          disabled={procesando}
                          onClick={handleAprobar}
                        >
                          Aprobar
                        </Button>
                      )}
                      <Button
                        variant="outlined"
                        color="error"
                        fullWidth={esMovil}
                        startIcon={<XCircle size={16} strokeWidth={1.5} />}
                        disabled={procesando}
                        onClick={handleRechazar}
                      >
                        Rechazar
                      </Button>
                    </Stack>
                  </>
                )}

                {ticketAbierto.estado === "APROBADO" && (
                  <Stack direction={{ xs: "column", sm: "row" }} spacing={1} flexWrap="wrap">
                    <Button
                      component="label"
                      variant="outlined"
                      fullWidth={esMovil}
                      startIcon={<Upload size={16} strokeWidth={1.5} />}
                    >
                      {ticketAbierto.link_factura_pdf ? "Reemplazar factura (PDF)" : "1. Subir factura (PDF)"}
                      <input
                        type="file"
                        hidden
                        accept="application/pdf,image/*"
                        onChange={(e) => {
                          const archivo = e.target.files?.[0];
                          if (archivo) handleSubirFactura(archivo);
                        }}
                      />
                    </Button>

                    {ticketAbierto.link_factura_pdf && (
                      <Button
                        variant="contained"
                        fullWidth={esMovil}
                        startIcon={<Sparkles size={16} strokeWidth={1.5} />}
                        onClick={() => setMotorFacturaAbierto(true)}
                      >
                        2. Validar y extraer con el Motor Documental
                      </Button>
                    )}
                  </Stack>
                )}

                {ticketAbierto.estado === "VINCULADO" && (
                  <Alert severity="success">
                    Facturado {ticketAbierto.factura_folio ? `(folio ${ticketAbierto.factura_folio})` : ""} — liga el
                    pago real en Flujos cuando se procese.
                  </Alert>
                )}
              </Stack>
            </DialogContent>
          </>
        )}
      </Dialog>

      {contextoVerificacion && (
        <MotorDocumentalDialog
          open={motorVerificacionAbierto}
          onClose={() => setMotorVerificacionAbierto(false)}
          contexto={contextoVerificacion}
        />
      )}
      {contextoFactura && (
        <MotorDocumentalDialog
          open={motorFacturaAbierto}
          onClose={() => setMotorFacturaAbierto(false)}
          contexto={contextoFactura}
        />
      )}

      <DocumentoPreviewDialog
        open={!!previewDoc}
        onClose={() => setPreviewDoc(null)}
        url={
          previewDoc
            ? previewDoc.tipo === "ticket"
              ? urlVerTicket(previewDoc.ticket.id_ticket)
              : urlVerFactura(previewDoc.ticket.id_ticket)
            : null
        }
        titulo={previewDoc ? `${previewDoc.tipo === "ticket" ? "Ticket" : "Factura"} ${previewDoc.ticket.id_ticket}` : ""}
      />
    </>
  );
}
