"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { Box, Button, Chip, CircularProgress, Stack, Tab, Tabs, Typography } from "@mui/material";
import { ArrowLeft, Check, FileSpreadsheet, FileText, X as XIcon } from "lucide-react";
import AppShell from "@/components/AppShell";
import { DOC, DocCampo, DocPanel } from "@/components/RequisicionDoc";
import { SessionUser, getSession } from "@/lib/auth";
import { ObraEtapa, listEtapas } from "@/lib/obra";
import { ViviendaProyecto, listProyectos } from "@/lib/vivienda";
import {
  Requisicion,
  RequisicionEstado,
  autorizarRequisicion,
  getRequisicion,
  rechazarRequisicion,
  validarRequisicion,
} from "@/lib/materiales";

const ESTADO_LABELS: Record<RequisicionEstado, string> = {
  PENDIENTE: "Pendiente de autorización",
  AUTORIZADA: "Autorizada",
  RECHAZADA: "Rechazada",
};

const ESTADO_BADGE: Record<RequisicionEstado, { bg: string; fg: string }> = {
  PENDIENTE: { bg: "#3a2b13", fg: DOC.accent },
  AUTORIZADA: { bg: "#12321f", fg: DOC.green },
  RECHAZADA: { bg: "#3a1414", fg: "#e05c5c" },
};

function moneda(valor: string | number) {
  const n = Number(valor);
  return n.toLocaleString("es-MX", { style: "currency", currency: "MXN" });
}

// Requisicion de materiales (21/Ago/2026) - vista de detalle 1:1 con el
// mockup de Ruben: documento oscuro, tarjetas de informacion general,
// etapa constructiva en tabs, tabla de conceptos con cotizacion, y las
// 3 firmas al pie. V1: sin generacion real de .xlsx (boton deshabilitado
// con nota) y sin firma electronica - ver docstring de Requisicion en el
// backend.
export default function RequisicionDetallePage() {
  const params = useParams();
  const router = useRouter();
  const id = params?.id as string;

  const [session, setSession] = useState<SessionUser | null>(null);
  const [requisicion, setRequisicion] = useState<Requisicion | null>(null);
  const [proyectos, setProyectos] = useState<ViviendaProyecto[]>([]);
  const [etapas, setEtapas] = useState<ObraEtapa[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [accionando, setAccionando] = useState(false);

  useEffect(() => {
    getSession().then(setSession);
  }, []);

  const puedeEditar = session?.perm_keys.includes("materiales.editar") ?? false;

  function refresh() {
    setLoading(true);
    Promise.all([getRequisicion(id), listProyectos(), listEtapas()])
      .then(([r, p, e]) => {
        setRequisicion(r);
        setProyectos(p);
        setEtapas(e);
      })
      .catch((err) => setError(err instanceof Error ? err.message : "Error desconocido"))
      .finally(() => setLoading(false));
  }

  useEffect(refresh, [id]);

  async function handleAccion(accion: "validar" | "autorizar" | "rechazar") {
    setAccionando(true);
    try {
      const actualizada =
        accion === "validar" ? await validarRequisicion(id) : accion === "autorizar" ? await autorizarRequisicion(id) : await rechazarRequisicion(id);
      setRequisicion(actualizada);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error desconocido");
    } finally {
      setAccionando(false);
    }
  }

  // Exportar (21/Ago/2026, pedido de Mariana: "en lugar de ver es exportar
  // como excel o pdf"). No hay un motor de .xlsx real con el formato de
  // Ruben todavia (pendiente, ver memoria del proyecto) - mientras tanto:
  // Excel = CSV descargable (Excel lo abre nativamente, sin depender de
  // ninguna libreria nueva) y PDF = vista de impresion limpia del
  // navegador (sin el chrome de la app), el usuario la guarda como PDF
  // desde el dialogo de impresion.
  function celdaCsv(valor: string | number) {
    const texto = String(valor ?? "");
    return /[",\n]/.test(texto) ? `"${texto.replace(/"/g, '""')}"` : texto;
  }

  function handleExportarExcel() {
    if (!requisicion) return;
    const filas = [
      ["Folio", requisicion.folio],
      ["Proyecto", proyecto?.alias_proyecto || proyecto?.denominacion || requisicion.proyecto],
      ["Empresa", requisicion.empresa || ""],
      ["Responsable", requisicion.responsable || ""],
      ["Etapa constructiva", requisicion.etapa_constructiva],
      ["Viviendas", requisicion.num_viviendas],
      ["Presupuesto asignado", requisicion.presupuesto_asignado],
      [],
      ["Concepto", "Cant./vivienda", "Cant. total", "Precio unitario", "Importe", "Cotización"],
      ...requisicion.lineas.map((l) => [
        l.concepto_nombre,
        l.cantidad_por_vivienda,
        l.cantidad_total,
        l.precio_unitario,
        l.importe,
        l.proveedor_cotizacion || "",
      ]),
      [],
      ["Total", "", "", "", total.toFixed(2), ""],
      [],
      ["Solicitó", requisicion.solicito_por || ""],
      ["Validó", requisicion.valido_por || ""],
      ["Autorizó compra", requisicion.autorizo_compra_por || ""],
    ];
    const csv = "﻿" + filas.map((fila) => fila.map(celdaCsv).join(",")).join("\r\n");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `${requisicion.folio}.csv`;
    link.click();
    URL.revokeObjectURL(url);
  }

  function handleExportarPdf() {
    if (!requisicion) return;
    const ventana = window.open("", "_blank");
    if (!ventana) return;
    const filasHtml = requisicion.lineas
      .map(
        (l) => `<tr>
          <td>${l.concepto_nombre}</td>
          <td style="text-align:right">${l.cantidad_por_vivienda}</td>
          <td style="text-align:right">${l.cantidad_total}</td>
          <td style="text-align:right">${moneda(l.precio_unitario)}</td>
          <td style="text-align:right">${moneda(l.importe)}</td>
          <td>${l.proveedor_cotizacion || "—"}</td>
        </tr>`
      )
      .join("");
    ventana.document.write(`<!doctype html>
<html><head><meta charset="utf-8"><title>${requisicion.folio}</title>
<style>
  body { font-family: Arial, sans-serif; padding: 24px; color: #111; }
  h1 { font-size: 18px; margin-bottom: 4px; }
  .muted { color: #666; font-size: 12px; }
  table { width: 100%; border-collapse: collapse; margin-top: 16px; font-size: 12px; }
  th, td { border-bottom: 1px solid #ddd; padding: 6px 8px; text-align: left; }
  .grid { display: flex; gap: 32px; margin-top: 16px; font-size: 13px; }
  .grid div span { display: block; color: #666; font-size: 11px; text-transform: uppercase; }
</style></head>
<body>
  <div class="muted">ADMIN DE OBRA · REQUISICIÓN DE MATERIALES</div>
  <h1>${requisicion.folio} · ${(proyecto?.alias_proyecto || proyecto?.denominacion || requisicion.proyecto).toUpperCase()}</h1>
  <div class="muted">Etapa: ${requisicion.etapa_constructiva} — Estado: ${ESTADO_LABELS[requisicion.estado]}</div>
  <div class="grid">
    <div><span>Empresa</span>${requisicion.empresa || "—"}</div>
    <div><span>Responsable</span>${requisicion.responsable || "—"}</div>
    <div><span>Viviendas</span>${requisicion.num_viviendas}</div>
    <div><span>Presupuesto asignado</span>${moneda(requisicion.presupuesto_asignado)}</div>
  </div>
  <table>
    <thead><tr><th>Concepto</th><th>Cant./vivienda</th><th>Cant. total</th><th>Precio unitario</th><th>Importe</th><th>Cotización</th></tr></thead>
    <tbody>${filasHtml}</tbody>
    <tfoot><tr><td colspan="4" style="text-align:right"><strong>Total</strong></td><td style="text-align:right"><strong>${moneda(total)}</strong></td><td></td></tr></tfoot>
  </table>
  <div class="grid" style="margin-top:32px">
    <div><span>Solicitó</span>${requisicion.solicito_por || "—"}</div>
    <div><span>Validó</span>${requisicion.valido_por || "— (pendiente)"}</div>
    <div><span>Autorizó compra</span>${requisicion.autorizo_compra_por || "— (pendiente)"}</div>
  </div>
</body></html>`);
    ventana.document.close();
    ventana.focus();
    ventana.print();
  }

  if (loading) {
    return (
      <AppShell>
        <Stack alignItems="center" sx={{ py: 6 }}>
          <CircularProgress size={20} />
        </Stack>
      </AppShell>
    );
  }

  if (error || !requisicion) {
    return (
      <AppShell>
        <Typography color="error">{error || "No se encontró la requisición."}</Typography>
      </AppShell>
    );
  }

  const proyecto = proyectos.find((p) => p.id_proyecto === requisicion.proyecto);
  const total = requisicion.lineas.reduce((acc, l) => acc + Number(l.importe), 0);
  const badge = ESTADO_BADGE[requisicion.estado];
  // Comparacion tolerante (espacios/mayusculas) - la etapa se guarda como
  // texto libre en Requisicion.etapa_constructiva, no como FK a ObraEtapa,
  // asi que puede no coincidir byte a byte con "numero nombre".
  const etapaEncontrada = etapas.findIndex(
    (et) => `${et.numero} ${et.nombre}`.trim().toLowerCase() === requisicion.etapa_constructiva.trim().toLowerCase()
  );
  const etapaIndex = etapaEncontrada === -1 ? false : etapaEncontrada;

  return (
    <AppShell>
      <Box
        sx={{
          bgcolor: DOC.bg,
          borderRadius: 2,
          p: { xs: 2, md: 4 },
          m: -1,
        }}
      >
        <Button
          size="small"
          startIcon={<ArrowLeft size={14} strokeWidth={1.5} />}
          onClick={() => router.push("/obra/requisiciones")}
          sx={{ color: DOC.textMuted, mb: 2, textTransform: "none" }}
        >
          Requisiciones
        </Button>

        {/* Encabezado */}
        <Stack direction={{ xs: "column", md: "row" }} justifyContent="space-between" spacing={2} sx={{ mb: 3 }}>
          <Stack spacing={0.5}>
            <Typography sx={{ fontSize: 11, letterSpacing: 1, color: DOC.textFaint, textTransform: "uppercase" }}>
              Admin de obra · Requisición de materiales
            </Typography>
            <Typography sx={{ fontSize: 22, fontWeight: 700, color: DOC.text }}>
              {requisicion.folio} · {(proyecto?.alias_proyecto || proyecto?.denominacion || requisicion.proyecto).toUpperCase()}
            </Typography>
            <Typography sx={{ fontSize: 13, color: DOC.textMuted }}>
              Etapa: {requisicion.etapa_constructiva}
            </Typography>
          </Stack>
          <Stack alignItems={{ xs: "flex-start", md: "flex-end" }} spacing={0.5}>
            <Chip
              size="small"
              label={ESTADO_LABELS[requisicion.estado]}
              sx={{ bgcolor: badge.bg, color: badge.fg, fontWeight: 600, border: "none" }}
            />
            <Typography sx={{ fontSize: 12, color: DOC.textMuted }}>
              <strong style={{ color: DOC.textFaint }}>Folio:</strong> {requisicion.folio}
            </Typography>
            <Typography sx={{ fontSize: 12, color: DOC.textMuted }}>
              <strong style={{ color: DOC.textFaint }}>Generado:</strong>{" "}
              {new Date(requisicion.created_at).toLocaleDateString("es-MX", { day: "2-digit", month: "short", year: "numeric" })}
            </Typography>
          </Stack>
        </Stack>

        <Stack spacing={3}>
          {/* Informacion general del presupuesto */}
          <DocPanel title="Información general del presupuesto">
            <Stack direction="row" spacing={5} flexWrap="wrap" useFlexGap>
              <DocCampo label="Proyecto" value={proyecto?.alias_proyecto || proyecto?.denominacion || requisicion.proyecto} />
              <DocCampo label="Empresa" value={requisicion.empresa || "—"} />
              <DocCampo label="Responsable" value={requisicion.responsable || "—"} />
              <DocCampo label="Presupuesto asignado" value={moneda(requisicion.presupuesto_asignado)} />
            </Stack>
          </DocPanel>

          {/* Viviendas que comprende */}
          <DocPanel title="Viviendas que comprende el presupuesto">
            <Stack direction="row" alignItems="center" spacing={2}>
              <Box
                sx={{
                  bgcolor: "#0f2233",
                  border: "1px solid #1b3a52",
                  borderRadius: 1.5,
                  px: 2,
                  py: 1,
                  minWidth: 120,
                }}
              >
                <Typography sx={{ fontSize: 20, fontWeight: 700, color: "#5aa8e0" }}>
                  {requisicion.num_viviendas}
                </Typography>
                <Typography sx={{ fontSize: 11, color: DOC.textMuted }}>viviendas</Typography>
              </Box>
              <Typography sx={{ fontSize: 12, color: DOC.textFaint }}>
                (catálogo de lotes por vivienda pendiente de conectar)
              </Typography>
            </Stack>
          </DocPanel>

          {/* Etapa constructiva */}
          <DocPanel title="Etapa constructiva">
            {etapas.length > 0 && (
              <Tabs
                value={etapaIndex}
                variant="scrollable"
                scrollButtons="auto"
                sx={{
                  mb: 2,
                  minHeight: 32,
                  "& .MuiTab-root": { color: DOC.textMuted, minHeight: 32, fontSize: 12, textTransform: "none" },
                  "& .Mui-selected": { color: `${DOC.accent} !important` },
                  "& .MuiTabs-indicator": { bgcolor: DOC.accent },
                }}
              >
                {etapas.map((et) => (
                  <Tab key={et.id_etapa} label={et.nombre} />
                ))}
              </Tabs>
            )}

            <Box sx={{ overflowX: "auto" }}>
              <Box component="table" sx={{ width: "100%", borderCollapse: "collapse" }}>
                <Box component="thead">
                  <Box component="tr">
                    {["Concepto", "Cant./vivienda", "Cant. total", "Precio unitario", "Importe", "Cotización"].map(
                      (h, i) => (
                        <Box
                          component="th"
                          key={h}
                          sx={{
                            textAlign: i === 0 ? "left" : "right",
                            fontSize: 11,
                            color: DOC.textFaint,
                            textTransform: "uppercase",
                            letterSpacing: 0.5,
                            pb: 1,
                            borderBottom: `1px solid ${DOC.divider}`,
                          }}
                        >
                          {h}
                        </Box>
                      )
                    )}
                  </Box>
                </Box>
                <Box component="tbody">
                  {requisicion.lineas.length === 0 ? (
                    <Box component="tr">
                      <Box component="td" colSpan={6} sx={{ py: 3, textAlign: "center", color: DOC.textMuted, fontSize: 13 }}>
                        Esta etapa no tiene conceptos presupuestados todavía.
                      </Box>
                    </Box>
                  ) : (
                    requisicion.lineas.map((l) => (
                      <Box
                        component="tr"
                        key={l.id_linea}
                        sx={{ "& td": { borderBottom: `1px solid ${DOC.divider}`, py: 1.25, fontSize: 13, color: DOC.text } }}
                      >
                        <Box component="td">{l.concepto_nombre}</Box>
                        <Box component="td" sx={{ textAlign: "right" }}>
                          {l.cantidad_por_vivienda}
                        </Box>
                        <Box component="td" sx={{ textAlign: "right" }}>
                          {l.cantidad_total}
                        </Box>
                        <Box component="td" sx={{ textAlign: "right" }}>
                          {moneda(l.precio_unitario)}
                        </Box>
                        <Box component="td" sx={{ textAlign: "right", fontWeight: 600 }}>
                          {moneda(l.importe)}
                        </Box>
                        <Box component="td" sx={{ textAlign: "right" }}>
                          {l.proveedor_cotizacion ? (
                            <Stack direction="row" spacing={0.5} justifyContent="flex-end" alignItems="center">
                              <Check size={13} strokeWidth={2} color={DOC.green} />
                              <Typography sx={{ fontSize: 12, color: DOC.textMuted }}>
                                {l.proveedor_cotizacion}
                              </Typography>
                            </Stack>
                          ) : (
                            <Typography sx={{ fontSize: 12, color: DOC.textFaint }}>Sin cotización</Typography>
                          )}
                        </Box>
                      </Box>
                    ))
                  )}
                </Box>
                {requisicion.lineas.length > 0 && (
                  <Box component="tfoot">
                    <Box component="tr">
                      <Box component="td" colSpan={4} sx={{ pt: 1.5, textAlign: "right", fontSize: 13, color: DOC.textMuted }}>
                        Total etapa · {requisicion.etapa_constructiva}
                      </Box>
                      <Box component="td" sx={{ pt: 1.5, textAlign: "right", fontSize: 15, fontWeight: 700, color: DOC.text }}>
                        {moneda(total)}
                      </Box>
                      <Box component="td" />
                    </Box>
                  </Box>
                )}
              </Box>
            </Box>
          </DocPanel>

          {/* Autorizacion */}
          <DocPanel title="Autorización">
            <Stack direction={{ xs: "column", md: "row" }} spacing={4}>
              {[
                { rol: "Solicitó", firmante: requisicion.solicito_por, cargo: "Residente de obra" },
                { rol: "Validó", firmante: requisicion.valido_por, cargo: requisicion.responsable || "Supervisor" },
                { rol: "Autorizó compra", firmante: requisicion.autorizo_compra_por, cargo: "Dirección de Finanzas" },
              ].map((f) => (
                <Stack key={f.rol} spacing={1} sx={{ flex: 1 }}>
                  <Box
                    sx={{
                      height: 36,
                      display: "flex",
                      alignItems: "flex-end",
                      color: DOC.text,
                      fontStyle: f.firmante ? "italic" : "normal",
                      fontSize: 14,
                    }}
                  >
                    {f.firmante || ""}
                  </Box>
                  <Box sx={{ borderTop: `1px solid ${DOC.divider}` }} />
                  <Typography sx={{ fontSize: 11, color: DOC.textFaint, textTransform: "uppercase" }}>Firma</Typography>
                  <Typography sx={{ fontSize: 13, fontWeight: 600, color: DOC.text }}>{f.rol}</Typography>
                  <Typography sx={{ fontSize: 12, color: DOC.textMuted }}>{f.cargo}</Typography>
                </Stack>
              ))}
            </Stack>
          </DocPanel>

          {/* Pie de acciones */}
          <Stack direction={{ xs: "column", sm: "row" }} justifyContent="space-between" alignItems={{ sm: "center" }} spacing={2}>
            <Typography sx={{ fontSize: 12, color: DOC.textFaint, maxWidth: 480 }}>
              El Excel exportado no sigue todavía el formato exacto de la plantilla de Ruben (columnas
              equivalentes, sin el diseño) — eso queda pendiente de construir.
            </Typography>
            <Stack direction="row" spacing={1.5}>
              {puedeEditar && requisicion.estado === "PENDIENTE" && (
                <>
                  <Button
                    size="small"
                    startIcon={<XIcon size={14} strokeWidth={2} />}
                    onClick={() => handleAccion("rechazar")}
                    disabled={accionando}
                    sx={{ color: "#e05c5c", textTransform: "none" }}
                  >
                    Rechazar
                  </Button>
                  {!requisicion.valido_por ? (
                    <Button
                      size="small"
                      variant="contained"
                      onClick={() => handleAccion("validar")}
                      disabled={accionando}
                      sx={{ textTransform: "none", bgcolor: DOC.accent, "&:hover": { bgcolor: "#c9762f" } }}
                    >
                      Validar
                    </Button>
                  ) : (
                    <Button
                      size="small"
                      variant="contained"
                      startIcon={<Check size={14} strokeWidth={2} />}
                      onClick={() => handleAccion("autorizar")}
                      disabled={accionando}
                      sx={{ textTransform: "none", bgcolor: DOC.accent, "&:hover": { bgcolor: "#c9762f" } }}
                    >
                      Autorizar compra
                    </Button>
                  )}
                </>
              )}
              <Button size="small" disabled sx={{ color: DOC.textFaint, textTransform: "none" }} title="Pendiente de construir">
                Vista previa
              </Button>
              <Button
                size="small"
                variant="contained"
                disabled
                title="Pendiente de construir"
                sx={{ textTransform: "none", bgcolor: DOC.accent, opacity: 0.5 }}
              >
                Generar .xlsx
              </Button>
            </Stack>
          </Stack>
        </Stack>
      </Box>
    </AppShell>
  );
}
