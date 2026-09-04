"use client";

import { useEffect, useState } from "react";
import {
  Alert,
  Button,
  Chip,
  CircularProgress,
  Dialog,
  DialogContent,
  DialogTitle,
  IconButton,
  Link as MuiLink,
  Paper,
  Stack,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Typography,
} from "@mui/material";
import { Eye, ReceiptText as TicketIcon, Sparkles, Upload, X as CloseIcon, XCircle } from "lucide-react";
import DocumentoPreviewDialog from "@/components/DocumentoPreviewDialog";
import MotorDocumentalDialog, { MotorDocumentalContexto } from "@/components/MotorDocumentalDialog";
import { SessionUser } from "@/lib/auth";
import {
  aprobarTicket,
  urlVerFactura,
  urlVerTicket,
  CATEGORIA_GASTO_LABELS,
  listTicketsReembolso,
  rechazarTicket,
  subirFacturaTicket,
  vincularFacturaTicket,
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
  // columna propia, solo sirven para que el analista los compare a ojo
  // contra descripcion/monto/fecha_gasto ya declarados) - "Confirmar" aqui
  // significa "ya lo revise, el gasto procede", asi que directo aprueba el
  // ticket. Se deja el resumen de lo extraido en comentarios, para que
  // quede trazado que se reviso y con que datos.
  async function handleConfirmarVerificacion(campos: Record<string, unknown>) {
    if (!ticketAbierto) return;
    const comentarios = `Verificado con Motor Documental: ${JSON.stringify(campos)}`;
    const actualizado = await aprobarTicket(ticketAbierto.id_ticket, comentarios, session?.user_id);
    setTicketAbierto(actualizado);
    await cargar();
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
            {loading ? (
              <TableRow>
                <TableCell colSpan={9} align="center">
                  <CircularProgress size={24} />
                </TableCell>
              </TableRow>
            ) : tickets.length === 0 ? (
              <TableRow>
                <TableCell colSpan={9} align="center">
                  <Typography variant="body2" color="text.secondary">
                    Sin tickets todavía.
                  </Typography>
                </TableCell>
              </TableRow>
            ) : (
              tickets.map((t) => (
                <TableRow key={t.id_ticket} hover>
                  <TableCell>{t.id_ticket}</TableCell>
                  <TableCell>{t.id_empleado}</TableCell>
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
              ))
            )}
          </TableBody>
        </Table>
      </TableContainer>

      <Dialog open={!!ticketAbierto} onClose={() => setTicketAbierto(null)} fullWidth maxWidth="sm">
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
                  <strong>Empleado:</strong> {ticketAbierto.id_empleado}
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
                  <strong>Sociedad:</strong> {ticketAbierto.sociedad || "—"}
                </Typography>
                {ticketAbierto.autorizado_por && (
                  <Typography variant="body2">
                    <strong>Autorizado por:</strong> {ticketAbierto.autorizado_por}{" "}
                    ({ticketAbierto.fecha_autorizacion})
                  </Typography>
                )}
                {/* Conceptos (03/Sep/2026, minuta punto 1: "solicitar
                    varios conceptos") - antes era un solo monto/categoria
                    por ticket, ahora una tabla de N gastos. */}
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
                {ticketAbierto.link_ticket && (
                  <MuiLink component="button" onClick={() => setPreviewDoc({ ticket: ticketAbierto, tipo: "ticket" })}>
                    Ver foto/comprobante subido por el empleado
                  </MuiLink>
                )}

                {ticketAbierto.estado === "PENDIENTE" && (
                  <>
                    <Typography variant="caption" color="text.secondary">
                      No se puede aprobar hasta que el Motor Documental verifique el comprobante subido por el
                      empleado.
                    </Typography>
                    <Button
                      variant="contained"
                      startIcon={<Sparkles size={16} strokeWidth={1.5} />}
                      onClick={() => setMotorVerificacionAbierto(true)}
                      disabled={!ticketAbierto.link_ticket}
                      sx={{ alignSelf: "flex-start" }}
                    >
                      Verificar con el Motor Documental y aprobar
                    </Button>

                    <Button
                      variant="outlined"
                      color="error"
                      startIcon={<XCircle size={16} strokeWidth={1.5} />}
                      disabled={procesando}
                      onClick={handleRechazar}
                      sx={{ alignSelf: "flex-start" }}
                    >
                      Rechazar
                    </Button>
                  </>
                )}

                {ticketAbierto.estado === "APROBADO" && (
                  <>
                    <Button component="label" variant="outlined" startIcon={<Upload size={16} strokeWidth={1.5} />}>
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
                        startIcon={<Sparkles size={16} strokeWidth={1.5} />}
                        onClick={() => setMotorFacturaAbierto(true)}
                        sx={{ alignSelf: "flex-start" }}
                      >
                        2. Validar y extraer con el Motor Documental
                      </Button>
                    )}
                  </>
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
