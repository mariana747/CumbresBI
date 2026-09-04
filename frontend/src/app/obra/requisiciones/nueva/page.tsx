"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Alert, Box, Button, CircularProgress, MenuItem, Stack, Tab, Tabs, TextField, Typography } from "@mui/material";
import { ArrowLeft } from "lucide-react";
import AppShell from "@/components/AppShell";
import { DOC, DocPanel, docFieldSx } from "@/components/RequisicionDoc";
import { SessionUser, getSession } from "@/lib/auth";
import { ObraEtapa, listEtapas } from "@/lib/obra";
import { ViviendaProyecto, listProyectos } from "@/lib/vivienda";
import { ConceptoPresupuesto, Presupuesto, createRequisicion, listConceptosPresupuesto, listPresupuestos } from "@/lib/materiales";

function moneda(valor: string | number) {
  const n = Number(valor);
  return n.toLocaleString("es-MX", { style: "currency", currency: "MXN" });
}

// Vista de alta de Requisicion (21/Ago/2026, pedido de Mariana: "este debe
// ser editable, es la vista de nueva requisicion") - MISMO documento que
// el detalle (/obra/requisiciones/[id]), pero con los campos editables en
// vez de solo lectura: reemplaza el dialogo simple que habia antes. La
// tabla de conceptos es una VISTA PREVIA en vivo (se recalcula cuando
// cambian presupuesto/etapa/viviendas) - los mismos numeros que generara
// el backend al guardar (ver RequisicionViewSet.perform_create), pero
// calculados aqui en el cliente solo para previsualizar, no se editan
// linea por linea todavia.
export default function NuevaRequisicionPage() {
  const router = useRouter();
  const [session, setSession] = useState<SessionUser | null>(null);
  const [proyectos, setProyectos] = useState<ViviendaProyecto[]>([]);
  const [presupuestos, setPresupuestos] = useState<Presupuesto[]>([]);
  const [etapas, setEtapas] = useState<ObraEtapa[]>([]);
  const [conceptos, setConceptos] = useState<ConceptoPresupuesto[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadingConceptos, setLoadingConceptos] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const [proyecto, setProyecto] = useState("");
  const [presupuestoId, setPresupuestoId] = useState("");
  const [empresa, setEmpresa] = useState("");
  const [responsable, setResponsable] = useState("");
  const [numViviendas, setNumViviendas] = useState("1");
  const [etapaSeleccionada, setEtapaSeleccionada] = useState<string | null>(null);
  const [comentarios, setComentarios] = useState("");

  useEffect(() => {
    getSession().then(setSession);
  }, []);

  useEffect(() => {
    setLoading(true);
    Promise.all([listProyectos(), listPresupuestos(), listEtapas()])
      .then(([p, pr, e]) => {
        setProyectos(p);
        setPresupuestos(pr);
        setEtapas(e);
        if (e.length > 0) setEtapaSeleccionada(`${e[0].numero} ${e[0].nombre}`);
      })
      .catch((err) => setError(err instanceof Error ? err.message : "Error desconocido"))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    if (!presupuestoId) {
      setConceptos([]);
      return;
    }
    setLoadingConceptos(true);
    listConceptosPresupuesto(presupuestoId)
      .then(setConceptos)
      .catch((err) => setError(err instanceof Error ? err.message : "Error desconocido"))
      .finally(() => setLoadingConceptos(false));
  }, [presupuestoId]);

  const presupuesto = presupuestos.find((p) => p.id_presupuesto === presupuestoId);
  const viviendas = Number(numViviendas) || 0;

  const lineasPreview = useMemo(() => {
    if (!etapaSeleccionada) return [];
    return conceptos
      .filter((c) => c.etapa_constructiva.trim().toLowerCase() === etapaSeleccionada.trim().toLowerCase())
      .map((c) => ({
        ...c,
        cantidad_total: Number(c.cantidad) * viviendas,
        importe: Number(c.cantidad) * viviendas * Number(c.precio_unitario),
      }));
  }, [conceptos, etapaSeleccionada, viviendas]);

  const total = lineasPreview.reduce((acc, l) => acc + l.importe, 0);
  const etapaIndex = etapas.findIndex((et) => `${et.numero} ${et.nombre}` === etapaSeleccionada);

  async function handleGenerar() {
    if (!proyecto || !presupuestoId || !etapaSeleccionada) {
      setError("Proyecto, presupuesto y etapa constructiva son requeridos.");
      return;
    }
    setSaving(true);
    setError(null);
    try {
      const creada = await createRequisicion({
        proyecto,
        presupuesto: presupuestoId,
        etapaConstructiva: etapaSeleccionada,
        empresa: empresa || null,
        responsable: responsable || null,
        numViviendas: viviendas || 1,
        comentarios: comentarios || null,
      });
      router.push(`/obra/requisiciones/${creada.id_requisicion}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error desconocido");
    } finally {
      setSaving(false);
    }
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

  return (
    <AppShell>
      <Box sx={{ bgcolor: DOC.bg, borderRadius: 2, p: { xs: 2, md: 4 }, m: -1 }}>
        <Button
          size="small"
          startIcon={<ArrowLeft size={14} strokeWidth={1.5} />}
          onClick={() => router.push("/obra/requisiciones")}
          sx={{ color: DOC.textMuted, mb: 2, textTransform: "none" }}
        >
          Requisiciones
        </Button>

        <Stack spacing={0.5} sx={{ mb: 3 }}>
          <Typography sx={{ fontSize: 11, letterSpacing: 1, color: DOC.textFaint, textTransform: "uppercase" }}>
            Admin de obra · Requisición de materiales
          </Typography>
          <Typography sx={{ fontSize: 22, fontWeight: 700, color: DOC.text }}>Nueva Requisición</Typography>
          <Typography sx={{ fontSize: 12, color: DOC.textFaint }}>
            El folio se genera al guardar. Mientras tanto, esta es una vista previa en vivo.
          </Typography>
        </Stack>

        {error && (
          <Alert severity="error" sx={{ mb: 2 }}>
            {error}
          </Alert>
        )}

        <Stack spacing={3}>
          <DocPanel title="Información general del presupuesto">
            <Stack direction="row" spacing={2} flexWrap="wrap" useFlexGap>
              <TextField
                size="small"
                select
                label="Proyecto"
                value={proyecto}
                onChange={(e) => setProyecto(e.target.value)}
                sx={{ ...docFieldSx, minWidth: 220 }}
              >
                {proyectos.length === 0 && <MenuItem value="">Sin proyectos todavía</MenuItem>}
                {proyectos.map((p) => (
                  <MenuItem key={p.id_proyecto} value={p.id_proyecto}>
                    {p.alias_proyecto || p.denominacion || p.id_proyecto}
                  </MenuItem>
                ))}
              </TextField>
              <TextField
                size="small"
                label="Empresa"
                value={empresa}
                onChange={(e) => setEmpresa(e.target.value)}
                sx={{ ...docFieldSx, minWidth: 220 }}
              />
              <TextField
                size="small"
                label="Responsable"
                value={responsable}
                onChange={(e) => setResponsable(e.target.value)}
                sx={{ ...docFieldSx, minWidth: 220 }}
              />
              <TextField
                size="small"
                select
                label="Presupuesto"
                value={presupuestoId}
                onChange={(e) => setPresupuestoId(e.target.value)}
                sx={{ ...docFieldSx, minWidth: 260 }}
              >
                {presupuestos.length === 0 && <MenuItem value="">Sin presupuestos todavía</MenuItem>}
                {presupuestos.map((p) => (
                  <MenuItem key={p.id_presupuesto} value={p.id_presupuesto}>
                    {p.denominacion || p.id_presupuesto} ({moneda(p.monto_total)})
                  </MenuItem>
                ))}
              </TextField>
            </Stack>
            {presupuesto && (
              <Typography sx={{ mt: 2, fontSize: 12, color: DOC.textMuted }}>
                Presupuesto asignado: <strong style={{ color: DOC.text }}>{moneda(presupuesto.monto_total)}</strong>
              </Typography>
            )}
          </DocPanel>

          <DocPanel title="Viviendas que comprende el presupuesto">
            <TextField
              size="small"
              type="number"
              label="Número de viviendas"
              value={numViviendas}
              onChange={(e) => setNumViviendas(e.target.value)}
              sx={{ ...docFieldSx, maxWidth: 200 }}
            />
          </DocPanel>

          <DocPanel title="Etapa constructiva">
            {etapas.length > 0 ? (
              <Tabs
                value={etapaIndex === -1 ? false : etapaIndex}
                onChange={(_, i) => setEtapaSeleccionada(`${etapas[i].numero} ${etapas[i].nombre}`)}
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
            ) : (
              <Typography sx={{ fontSize: 13, color: DOC.textMuted, mb: 2 }}>
                Todavía no hay etapas dadas de alta en el catálogo de Obra.
              </Typography>
            )}

            {!presupuestoId ? (
              <Typography sx={{ fontSize: 13, color: DOC.textFaint }}>
                Selecciona un presupuesto para ver los conceptos de esta etapa.
              </Typography>
            ) : loadingConceptos ? (
              <Stack alignItems="center" sx={{ py: 2 }}>
                <CircularProgress size={18} />
              </Stack>
            ) : (
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
                    {lineasPreview.length === 0 ? (
                      <Box component="tr">
                        <Box component="td" colSpan={6} sx={{ py: 3, textAlign: "center", color: DOC.textMuted, fontSize: 13 }}>
                          Esta etapa no tiene conceptos presupuestados todavía.
                        </Box>
                      </Box>
                    ) : (
                      lineasPreview.map((l) => (
                        <Box
                          component="tr"
                          key={l.id_concepto}
                          sx={{ "& td": { borderBottom: `1px solid ${DOC.divider}`, py: 1.25, fontSize: 13, color: DOC.text } }}
                        >
                          <Box component="td">{l.concepto}</Box>
                          <Box component="td" sx={{ textAlign: "right" }}>
                            {l.cantidad}
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
                            {l.material_nombre ? (
                              <Typography sx={{ fontSize: 12, color: DOC.textMuted }}>{l.material_nombre}</Typography>
                            ) : (
                              <Typography sx={{ fontSize: 12, color: DOC.textFaint }}>Sin cotización</Typography>
                            )}
                          </Box>
                        </Box>
                      ))
                    )}
                  </Box>
                  {lineasPreview.length > 0 && (
                    <Box component="tfoot">
                      <Box component="tr">
                        <Box component="td" colSpan={4} sx={{ pt: 1.5, textAlign: "right", fontSize: 13, color: DOC.textMuted }}>
                          Total etapa
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
            )}
          </DocPanel>

          <DocPanel title="Comentarios">
            <TextField
              size="small"
              value={comentarios}
              onChange={(e) => setComentarios(e.target.value)}
              multiline
              minRows={2}
              fullWidth
              sx={docFieldSx}
            />
          </DocPanel>

          <Stack direction="row" justifyContent="flex-end" spacing={1.5}>
            <Button
              size="small"
              onClick={() => router.push("/obra/requisiciones")}
              sx={{ color: DOC.textMuted, textTransform: "none" }}
            >
              Cancelar
            </Button>
            <Button
              size="small"
              variant="contained"
              onClick={handleGenerar}
              disabled={saving}
              sx={{ textTransform: "none", bgcolor: DOC.accent, "&:hover": { bgcolor: "#c9762f" } }}
            >
              {saving ? <CircularProgress size={16} /> : "Generar requisición"}
            </Button>
          </Stack>
        </Stack>
      </Box>
    </AppShell>
  );
}
