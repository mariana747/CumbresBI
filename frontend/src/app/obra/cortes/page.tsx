"use client";

import { useEffect, useMemo, useState } from "react";
import {
  Alert,
  Box,
  Button,
  Chip,
  CircularProgress,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  IconButton,
  MenuItem,
  Paper,
  Stack,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  TextField,
  Typography,
} from "@mui/material";
import { CalendarCheck, CheckCircle2, Layers, Plus, X as CloseIcon } from "lucide-react";
import AppShell from "@/components/AppShell";
import { SessionUser, getSession } from "@/lib/auth";
import {
  ObraConcepto,
  ObraCorteEstado,
  ObraCorteSemanal,
  ObraCorteSemanalDetalle,
  ObraEtapa,
  ObraLote,
  aprobarCorte,
  createCorte,
  listConceptos,
  listCortes,
  listDetalleCorte,
  listEtapas,
  listLotes,
} from "@/lib/obra";
import { OBRA_AVANCE_PALETTE, OBRA_ETAPA_COLORS } from "@/theme/theme";

const ESTADO_LABELS: Record<ObraCorteEstado, string> = {
  BORRADOR: "Borrador",
  EN_REVISION: "En revisión",
  APROBADO: "Aprobado",
};

const ESTADO_COLOR: Record<ObraCorteEstado, "default" | "warning" | "success"> = {
  BORRADOR: "default",
  EN_REVISION: "warning",
  APROBADO: "success",
};

const FORM_VACIO = { proyecto: "", fechaCorte: "", semanaDeFase: 1, comentarios: "" };

// Corte semanal (viernes) - snapshot que se envia como reporte formal. El
// avance en si se actualiza a diario en vivo (ver /obra/avance); este
// corte NO se cierra solo por fecha/cron, siempre requiere que alguien con
// el permiso obra.aprobar (Supervisor de Obra) lo valide manualmente.
export default function ObraCortesPage() {
  const [session, setSession] = useState<SessionUser | null>(null);
  const [cortes, setCortes] = useState<ObraCorteSemanal[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [form, setForm] = useState(FORM_VACIO);
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [aprobando, setAprobando] = useState<string | null>(null);

  // Snapshot congelado (ObraCorteSemanalDetalle) - solo existe despues de
  // aprobar un corte, ver views.py::ObraCorteSemanalViewSet.aprobar. Se
  // muestra agrupado por etapa/lote, igual look que /obra/avance (pedido
  // de Mariana: la lista plana no era intuitiva).
  const [detalleDialog, setDetalleDialog] = useState<ObraCorteSemanal | null>(null);
  const [detalle, setDetalle] = useState<ObraCorteSemanalDetalle[]>([]);
  const [etapas, setEtapas] = useState<ObraEtapa[]>([]);
  const [conceptos, setConceptos] = useState<ObraConcepto[]>([]);
  const [lotesCorte, setLotesCorte] = useState<ObraLote[]>([]);
  const [loadingDetalle, setLoadingDetalle] = useState(false);

  useEffect(() => {
    getSession().then(setSession);
  }, []);

  const puedeCrear = session?.perm_keys.includes("obra.crear") ?? false;
  const puedeAprobar = session?.perm_keys.includes("obra.aprobar") ?? false;

  function refresh() {
    setLoading(true);
    listCortes()
      .then(setCortes)
      .catch((err) => setError(err instanceof Error ? err.message : "Error desconocido"))
      .finally(() => setLoading(false));
  }

  useEffect(refresh, []);

  function abrirAlta() {
    setForm(FORM_VACIO);
    setFormError(null);
    setDialogOpen(true);
  }

  async function handleGuardar() {
    if (!form.proyecto.trim() || !form.fechaCorte) {
      setFormError("Proyecto y fecha de corte son requeridos.");
      return;
    }
    setSaving(true);
    setFormError(null);
    try {
      await createCorte({
        proyecto: form.proyecto,
        fechaCorte: form.fechaCorte,
        semanaDeFase: form.semanaDeFase,
        comentarios: form.comentarios || null,
      });
      setDialogOpen(false);
      refresh();
    } catch (err) {
      setFormError(err instanceof Error ? err.message : "Error desconocido");
    } finally {
      setSaving(false);
    }
  }

  async function handleAprobar(corte: ObraCorteSemanal) {
    if (!session) return;
    if (
      !window.confirm(
        `¿Cerrar el corte del ${corte.fecha_corte} (proyecto ${corte.proyecto})? Se marcará como Aprobado y no debería editarse después.`
      )
    ) {
      return;
    }
    setAprobando(corte.id_corte);
    try {
      await aprobarCorte(corte.id_corte, session.user_id);
      refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error desconocido");
    } finally {
      setAprobando(null);
    }
  }

  function abrirDetalle(corte: ObraCorteSemanal) {
    setDetalleDialog(corte);
    setLoadingDetalle(true);
    Promise.all([listDetalleCorte(corte.id_corte), listEtapas(), listConceptos(), listLotes()])
      .then(([det, e, c, l]) => {
        setDetalle(det);
        setEtapas(e);
        setConceptos(c);
        setLotesCorte(l.filter((lote) => lote.proyecto === corte.proyecto));
      })
      .catch((err) => setError(err instanceof Error ? err.message : "Error desconocido"))
      .finally(() => setLoadingDetalle(false));
  }

  // Mapa "concepto-lote" -> % congelado, para pintar la tabla agrupada.
  const detallePorConceptoLote = useMemo(() => {
    const mapa = new Map<string, number>();
    for (const d of detalle) {
      mapa.set(`${d.concepto}-${d.lote}`, Number(d.porcentaje_acumulado));
    }
    return mapa;
  }, [detalle]);

  const conceptosPorEtapaDetalle = useMemo(() => {
    const idsConEtapa = new Set(detalle.map((d) => d.concepto));
    const conceptosConDetalle = conceptos.filter((c) => idsConEtapa.has(c.id_concepto));
    const grupos = new Map<string, ObraConcepto[]>();
    for (const c of conceptosConDetalle) {
      const lista = grupos.get(c.etapa) ?? [];
      lista.push(c);
      grupos.set(c.etapa, lista);
    }
    return grupos;
  }, [detalle, conceptos]);

  function colorSnapshot(pct: number | undefined): string | undefined {
    if (pct === undefined) return undefined;
    if (pct > 1) return OBRA_AVANCE_PALETTE.sobreestimado;
    if (pct === 1) return OBRA_AVANCE_PALETTE.completo;
    if (pct > 0) return OBRA_AVANCE_PALETTE.falta;
    return undefined;
  }

  return (
    <AppShell>
      <Stack direction="row" alignItems="center" spacing={1.5} sx={{ mb: 0.5 }}>
        <CalendarCheck size={22} strokeWidth={1.5} />
        <Typography variant="h5">Cortes semanales</Typography>
      </Stack>
      <Typography variant="body2" color="text.secondary" sx={{ mb: 3 }}>
        Snapshot del avance cada viernes. El avance se actualiza a diario en tiempo real — el corte no se
        cierra solo: requiere validación manual del Supervisor de Obra antes de enviarse como reporte.
      </Typography>

      {error && (
        <Alert severity="error" sx={{ mb: 3 }}>
          {error}
        </Alert>
      )}

      <Paper variant="outlined">
        <Stack direction="row" spacing={2} alignItems="center" sx={{ p: 2 }}>
          {puedeCrear && (
            <Button
              size="small"
              variant="contained"
              startIcon={<Plus size={14} strokeWidth={2} />}
              onClick={abrirAlta}
              sx={{ ml: "auto" }}
            >
              Nuevo corte
            </Button>
          )}
        </Stack>
        <TableContainer>
          <Table size="small">
            <TableHead>
              <TableRow>
                <TableCell>Proyecto</TableCell>
                <TableCell>Fecha de corte</TableCell>
                <TableCell align="center">Semana de fase</TableCell>
                <TableCell>Estado</TableCell>
                <TableCell>Aprobado por</TableCell>
                <TableCell align="right">Acciones</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {loading ? (
                <TableRow>
                  <TableCell colSpan={6} align="center" sx={{ py: 3 }}>
                    <CircularProgress size={20} />
                  </TableCell>
                </TableRow>
              ) : cortes.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={6} align="center" sx={{ py: 3 }}>
                    <Typography variant="body2" color="text.secondary">
                      Sin cortes registrados.
                    </Typography>
                  </TableCell>
                </TableRow>
              ) : (
                cortes.map((corte) => (
                  <TableRow key={corte.id_corte} hover>
                    <TableCell>{corte.proyecto}</TableCell>
                    <TableCell>{corte.fecha_corte}</TableCell>
                    <TableCell align="center">{corte.semana_de_fase} / 4</TableCell>
                    <TableCell>
                      <Chip size="small" label={ESTADO_LABELS[corte.estado]} color={ESTADO_COLOR[corte.estado]} />
                    </TableCell>
                    <TableCell>{corte.aprobado_por || "—"}</TableCell>
                    <TableCell align="right">
                      {corte.estado !== "APROBADO" && puedeAprobar && (
                        <IconButton
                          size="small"
                          aria-label="Aprobar corte"
                          onClick={() => handleAprobar(corte)}
                          disabled={aprobando === corte.id_corte}
                        >
                          {aprobando === corte.id_corte ? (
                            <CircularProgress size={14} />
                          ) : (
                            <CheckCircle2 size={16} strokeWidth={1.5} />
                          )}
                        </IconButton>
                      )}
                      {corte.estado === "APROBADO" && (
                        <IconButton size="small" aria-label="Ver snapshot" onClick={() => abrirDetalle(corte)}>
                          <Layers size={16} strokeWidth={1.5} />
                        </IconButton>
                      )}
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </TableContainer>
      </Paper>

      <Dialog open={dialogOpen} onClose={() => setDialogOpen(false)} fullWidth maxWidth="sm">
        <DialogTitle sx={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          Nuevo corte semanal
          <IconButton onClick={() => setDialogOpen(false)} size="small" aria-label="Cerrar">
            <CloseIcon size={18} strokeWidth={1.5} />
          </IconButton>
        </DialogTitle>
        <DialogContent dividers>
          {formError && (
            <Alert severity="error" sx={{ mb: 2 }}>
              {formError}
            </Alert>
          )}
          <Stack spacing={2}>
            <TextField
              size="small"
              label="Proyecto"
              value={form.proyecto}
              onChange={(e) => setForm({ ...form, proyecto: e.target.value })}
              fullWidth
            />
            <TextField
              size="small"
              label="Fecha de corte (viernes)"
              type="date"
              value={form.fechaCorte}
              onChange={(e) => setForm({ ...form, fechaCorte: e.target.value })}
              InputLabelProps={{ shrink: true }}
              fullWidth
            />
            <TextField
              size="small"
              select
              label="Semana de fase"
              value={form.semanaDeFase}
              onChange={(e) => setForm({ ...form, semanaDeFase: Number(e.target.value) })}
              fullWidth
            >
              {[1, 2, 3, 4].map((n) => (
                <MenuItem key={n} value={n}>
                  Semana {n} de 4
                </MenuItem>
              ))}
            </TextField>
            <TextField
              size="small"
              label="Comentarios"
              value={form.comentarios}
              onChange={(e) => setForm({ ...form, comentarios: e.target.value })}
              multiline
              minRows={2}
              fullWidth
            />
          </Stack>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setDialogOpen(false)}>Cancelar</Button>
          <Button variant="contained" onClick={handleGuardar} disabled={saving}>
            {saving ? <CircularProgress size={16} /> : "Guardar"}
          </Button>
        </DialogActions>
      </Dialog>

      <Dialog open={Boolean(detalleDialog)} onClose={() => setDetalleDialog(null)} fullWidth maxWidth="md">
        <DialogTitle sx={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          Snapshot congelado — {detalleDialog?.proyecto} ({detalleDialog?.fecha_corte})
          <IconButton onClick={() => setDetalleDialog(null)} size="small" aria-label="Cerrar">
            <CloseIcon size={18} strokeWidth={1.5} />
          </IconButton>
        </DialogTitle>
        <DialogContent dividers>
          <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
            Este es el % acumulado real de cada concepto+lote al momento en que se aprobó este corte — no
            cambia aunque se sigan capturando estimaciones después.
          </Typography>
          {loadingDetalle ? (
            <Stack alignItems="center" sx={{ py: 3 }}>
              <CircularProgress size={20} />
            </Stack>
          ) : detalle.length === 0 ? (
            <Typography variant="body2" color="text.secondary">
              Sin filas en el snapshot (no había estimaciones capturadas al momento de aprobar).
            </Typography>
          ) : (
            <Stack spacing={3} sx={{ maxHeight: 500, overflow: "auto" }}>
              {etapas.map((etapa, index) => {
                const conceptosEtapa = conceptosPorEtapaDetalle.get(etapa.id_etapa) ?? [];
                if (conceptosEtapa.length === 0) return null;
                return (
                  <Stack key={etapa.id_etapa} spacing={1}>
                    <Stack direction="row" alignItems="center" spacing={1}>
                      <Box
                        sx={{
                          width: 10,
                          height: 10,
                          borderRadius: "50%",
                          bgcolor: OBRA_ETAPA_COLORS[index % OBRA_ETAPA_COLORS.length],
                        }}
                      />
                      <Typography variant="subtitle2">
                        {etapa.numero} — {etapa.nombre}
                      </Typography>
                    </Stack>
                    <TableContainer>
                      <Table size="small">
                        <TableHead>
                          <TableRow>
                            <TableCell>No.</TableCell>
                            <TableCell>Concepto</TableCell>
                            {lotesCorte.map((l) => (
                              <TableCell key={l.id_lote} align="center">
                                Lote {l.numero_lote}
                              </TableCell>
                            ))}
                          </TableRow>
                        </TableHead>
                        <TableBody>
                          {conceptosEtapa.map((c) => (
                            <TableRow key={c.id_concepto} hover>
                              <TableCell>{c.numero}</TableCell>
                              <TableCell sx={{ maxWidth: 260, fontSize: "0.75rem" }}>{c.descripcion}</TableCell>
                              {lotesCorte.map((l) => {
                                const pct = detallePorConceptoLote.get(`${c.id_concepto}-${l.id_lote}`);
                                const color = colorSnapshot(pct);
                                return (
                                  <TableCell
                                    key={l.id_lote}
                                    align="center"
                                    sx={color ? { bgcolor: color, fontWeight: 600 } : undefined}
                                  >
                                    {pct !== undefined ? `${Math.round(pct * 100)}%` : "—"}
                                  </TableCell>
                                );
                              })}
                            </TableRow>
                          ))}
                        </TableBody>
                      </Table>
                    </TableContainer>
                  </Stack>
                );
              })}
            </Stack>
          )}
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setDetalleDialog(null)}>Cerrar</Button>
        </DialogActions>
      </Dialog>
    </AppShell>
  );
}
