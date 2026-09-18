"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Alert, Autocomplete, Box, Button, CircularProgress, Stack, Tab, Tabs, TextField, Typography } from "@mui/material";
import { ArrowLeft } from "lucide-react";
import AppShell from "@/components/AppShell";
import { DOC_LIGHT, DocCampo, DocPanel, buildDocFieldSx } from "@/components/RequisicionDoc";
import { SessionUser, getSession } from "@/lib/auth";
import { GeneralSociedad, listSociedades } from "@/lib/iam";
import { ObraEtapa, ObraLote, listEtapas, listLotes } from "@/lib/obra";
import { ViviendaProyecto, listProyectos } from "@/lib/vivienda";
import { ConceptoPresupuesto, MaterialCatalogo, Presupuesto, createRequisicion, listConceptosPresupuesto, listMateriales, listPresupuestos } from "@/lib/materiales";

const docFieldSx = buildDocFieldSx(DOC_LIGHT);

function moneda(valor: string | number) {
  const n = Number(valor);
  return n.toLocaleString("es-MX", { style: "currency", currency: "MXN" });
}

function nombreObra(l: ObraLote) {
  return l.tipo === "CASA" ? `Mz ${l.manzana} - Lote ${l.numero_lote}` : l.identificador || l.id_lote;
}

function nombreSociedad(s: GeneralSociedad) {
  return s.alias_sociedad || s.razon_social || s.rfc;
}

// Vista de alta de Requisicion - MISMO "documento" (DocPanel) que el
// detalle (/obra/requisiciones/[id]), pero en blanco (DOC_LIGHT, pedido de
// Mariana 18/Sep/2026: "mantengo como si fuera hoja [pero] en blanco, no
// en negro" - el detalle SI sigue en oscuro, ese no cambio).
//
// Rediseño 18/Sep/2026 (ver obra-requisicion-flujo-completo-rediseno en
// memoria del proyecto): la jerarquia real es Proyecto -> Obra ->
// Presupuesto propio (cada Obra tiene el suyo, ya NO hay un solo
// Presupuesto por Proyecto escalado por numero de viviendas) - aqui se
// elige un conjunto de Obras del mismo proyecto (casas y/o especiales) y
// la vista previa AGREGA los ConceptoPresupuesto (ya con Material
// asignado) de la etapa elegida entre esas Obras, agrupado por Material -
// el precio de cada linea es el vigente en el Catalogo de Materiales, no
// el que tenia el concepto.
//
// Empresa -> Proyecto (18/Sep/2026, pedido de Mariana): se elige primero
// la Sociedad (dropdown real contra iam-service) y el Proyecto se filtra
// contra ViviendaProyecto.propietario (RFC de esa Sociedad) - antes
// "Empresa" era un campo de texto libre suelto, sin relacion con Proyecto.
export default function NuevaRequisicionPage() {
  const router = useRouter();
  const [session, setSession] = useState<SessionUser | null>(null);
  const [sociedades, setSociedades] = useState<GeneralSociedad[]>([]);
  const [proyectos, setProyectos] = useState<ViviendaProyecto[]>([]);
  const [lotes, setLotes] = useState<ObraLote[]>([]);
  const [etapas, setEtapas] = useState<ObraEtapa[]>([]);
  const [materiales, setMateriales] = useState<MaterialCatalogo[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadingPreview, setLoadingPreview] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const [empresaRfc, setEmpresaRfc] = useState("");
  const [proyecto, setProyecto] = useState("");
  const [obrasSeleccionadas, setObrasSeleccionadas] = useState<ObraLote[]>([]);
  const [responsable, setResponsable] = useState("");
  const [etapaSeleccionada, setEtapaSeleccionada] = useState<string | null>(null);
  const [comentarios, setComentarios] = useState("");
  const [conceptosPorObra, setConceptosPorObra] = useState<ConceptoPresupuesto[]>([]);

  useEffect(() => {
    getSession().then(setSession);
  }, []);

  useEffect(() => {
    setLoading(true);
    Promise.all([listSociedades(), listProyectos(), listEtapas(), listMateriales()])
      .then(([s, p, e, m]) => {
        setSociedades(s);
        setProyectos(p);
        setEtapas(e);
        setMateriales(m);
        if (e.length > 0) setEtapaSeleccionada(`${e[0].numero} ${e[0].nombre}`);
      })
      .catch((err) => setError(err instanceof Error ? err.message : "Error desconocido"))
      .finally(() => setLoading(false));
  }, []);

  const proyectosDeLaEmpresa = useMemo(
    () => proyectos.filter((p) => p.propietario === empresaRfc),
    [proyectos, empresaRfc]
  );

  useEffect(() => {
    setProyecto("");
  }, [empresaRfc]);

  useEffect(() => {
    setObrasSeleccionadas([]);
    if (!proyecto) {
      setLotes([]);
      return;
    }
    listLotes({ proyecto })
      .then(setLotes)
      .catch((err) => setError(err instanceof Error ? err.message : "Error desconocido"));
  }, [proyecto]);

  // Al cambiar la seleccion de Obras, jala el Presupuesto de CADA UNA y
  // junta todos sus ConceptoPresupuesto - la agregacion por Material y
  // etapa se hace en lineasPreview (useMemo) para no repetir el fetch al
  // solo cambiar de etapa.
  useEffect(() => {
    if (obrasSeleccionadas.length === 0) {
      setConceptosPorObra([]);
      return;
    }
    setLoadingPreview(true);
    Promise.all(obrasSeleccionadas.map((o) => listPresupuestos({ obra: o.id_lote })))
      .then((listasPresupuestos) => {
        const presupuestos: Presupuesto[] = listasPresupuestos.flat();
        return Promise.all(presupuestos.map((p) => listConceptosPresupuesto(p.id_presupuesto)));
      })
      .then((listasConceptos) => setConceptosPorObra(listasConceptos.flat()))
      .catch((err) => setError(err instanceof Error ? err.message : "Error desconocido"))
      .finally(() => setLoadingPreview(false));
  }, [obrasSeleccionadas]);

  const lineasPreview = useMemo(() => {
    if (!etapaSeleccionada) return [];
    const cantidadPorMaterial = new Map<string, number>();
    conceptosPorObra
      .filter((c) => c.material && c.etapa_constructiva.trim().toLowerCase() === etapaSeleccionada.trim().toLowerCase())
      .forEach((c) => {
        const idMaterial = c.material as string;
        cantidadPorMaterial.set(idMaterial, (cantidadPorMaterial.get(idMaterial) || 0) + Number(c.cantidad));
      });
    return Array.from(cantidadPorMaterial.entries()).map(([idMaterial, cantidadTotal]) => {
      const material = materiales.find((m) => m.id_material === idMaterial);
      const precioUnitario = Number(material?.precio_unitario || 0);
      return {
        idMaterial,
        materialNombre: material?.material || idMaterial,
        cantidadTotal,
        precioUnitario,
        importe: cantidadTotal * precioUnitario,
      };
    });
  }, [conceptosPorObra, etapaSeleccionada, materiales]);

  const total = lineasPreview.reduce((acc, l) => acc + l.importe, 0);
  const etapaIndex = etapas.findIndex((et) => `${et.numero} ${et.nombre}` === etapaSeleccionada);
  const empresaSeleccionada = sociedades.find((s) => s.rfc === empresaRfc);
  const proyectoSeleccionado = proyectos.find((p) => p.id_proyecto === proyecto);

  async function handleGenerar() {
    if (!proyecto || obrasSeleccionadas.length === 0 || !etapaSeleccionada) {
      setError("Proyecto, al menos una Obra y la etapa constructiva son requeridos.");
      return;
    }
    setSaving(true);
    setError(null);
    try {
      const creada = await createRequisicion({
        proyecto,
        obras: obrasSeleccionadas.map((o) => o.id_lote),
        etapaConstructiva: etapaSeleccionada,
        empresa: empresaSeleccionada ? nombreSociedad(empresaSeleccionada) : null,
        responsable: responsable || null,
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
      <Box sx={{ bgcolor: DOC_LIGHT.bg, borderRadius: 2, p: { xs: 2, md: 4 }, m: -1 }}>
        <Button
          size="small"
          startIcon={<ArrowLeft size={14} strokeWidth={1.5} />}
          onClick={() => router.push("/obra/requisiciones")}
          sx={{ color: DOC_LIGHT.textMuted, mb: 2, textTransform: "none" }}
        >
          Requisiciones
        </Button>

        <Stack spacing={0.5} sx={{ mb: 3 }}>
          <Typography sx={{ fontSize: 11, letterSpacing: 1, color: DOC_LIGHT.textFaint, textTransform: "uppercase" }}>
            Admin de obra · Requisición de materiales
          </Typography>
          <Typography sx={{ fontSize: 22, fontWeight: 700, color: DOC_LIGHT.text }}>Nueva Requisición</Typography>
          <Typography sx={{ fontSize: 12, color: DOC_LIGHT.textFaint }}>
            El folio se genera al guardar. Mientras tanto, esta es una vista previa en vivo.
          </Typography>
        </Stack>

        {error && (
          <Alert severity="error" sx={{ mb: 2 }}>
            {error}
          </Alert>
        )}

        <Stack spacing={3}>
          <DocPanel title="Información general" tokens={DOC_LIGHT}>
            <Stack direction="row" spacing={2} flexWrap="wrap" useFlexGap sx={{ mb: empresaSeleccionada ? 2 : 0 }}>
              <Autocomplete
                size="small"
                sx={{ ...docFieldSx, minWidth: 260 }}
                options={sociedades}
                getOptionLabel={nombreSociedad}
                value={empresaSeleccionada ?? null}
                onChange={(_, valor) => setEmpresaRfc(valor?.rfc ?? "")}
                isOptionEqualToValue={(a, b) => a.rfc === b.rfc}
                renderInput={(params) => <TextField {...params} label="Empresa" />}
              />
              <Autocomplete
                size="small"
                sx={{ ...docFieldSx, minWidth: 220 }}
                disabled={!empresaRfc}
                options={proyectosDeLaEmpresa}
                getOptionLabel={(p) => p.alias_proyecto || p.denominacion || p.id_proyecto}
                value={proyectoSeleccionado ?? null}
                onChange={(_, valor) => setProyecto(valor?.id_proyecto ?? "")}
                isOptionEqualToValue={(a, b) => a.id_proyecto === b.id_proyecto}
                renderInput={(params) => (
                  <TextField {...params} label="Proyecto" placeholder={empresaRfc ? undefined : "Elige una Empresa primero"} />
                )}
              />
              <TextField
                size="small"
                label="Responsable"
                value={responsable}
                onChange={(e) => setResponsable(e.target.value)}
                sx={{ ...docFieldSx, minWidth: 220 }}
              />
            </Stack>
            {/* Nombre de la Empresa visible en la hoja, no solo en el
            dropdown (18/Sep/2026, pedido de Mariana). */}
            {empresaSeleccionada && (
              <Stack direction="row" spacing={5} flexWrap="wrap" useFlexGap>
                <DocCampo label="Empresa" value={nombreSociedad(empresaSeleccionada)} tokens={DOC_LIGHT} />
                {proyectoSeleccionado && (
                  <DocCampo
                    label="Proyecto"
                    value={proyectoSeleccionado.alias_proyecto || proyectoSeleccionado.denominacion || proyectoSeleccionado.id_proyecto}
                    tokens={DOC_LIGHT}
                  />
                )}
              </Stack>
            )}
          </DocPanel>

          <DocPanel title="Obras que comprende" tokens={DOC_LIGHT}>
            {/* Multi-select de Obras del proyecto - reemplaza el campo
            suelto "Numero de viviendas": puede mezclar CASA y ESPECIAL,
            siempre del mismo proyecto. */}
            <Autocomplete
              multiple
              size="small"
              disabled={!proyecto}
              options={lotes}
              value={obrasSeleccionadas}
              onChange={(_, valor) => setObrasSeleccionadas(valor)}
              getOptionLabel={nombreObra}
              isOptionEqualToValue={(a, b) => a.id_lote === b.id_lote}
              renderInput={(params) => (
                <TextField {...params} label="Obras" placeholder={proyecto ? "Elige una o más Obras..." : "Elige un proyecto primero"} />
              )}
              sx={docFieldSx}
            />
          </DocPanel>

          <DocPanel title="Etapa constructiva" tokens={DOC_LIGHT}>
            {etapas.length > 0 ? (
              <Tabs
                value={etapaIndex === -1 ? false : etapaIndex}
                onChange={(_, i) => setEtapaSeleccionada(`${etapas[i].numero} ${etapas[i].nombre}`)}
                variant="scrollable"
                scrollButtons="auto"
                sx={{
                  mb: 2,
                  minHeight: 32,
                  "& .MuiTab-root": { color: DOC_LIGHT.textMuted, minHeight: 32, fontSize: 12, textTransform: "none" },
                  "& .Mui-selected": { color: `${DOC_LIGHT.accent} !important` },
                  "& .MuiTabs-indicator": { bgcolor: DOC_LIGHT.accent },
                }}
              >
                {etapas.map((et) => (
                  <Tab key={et.id_etapa} label={et.nombre} />
                ))}
              </Tabs>
            ) : (
              <Typography sx={{ fontSize: 13, color: DOC_LIGHT.textMuted, mb: 2 }}>
                Todavía no hay etapas dadas de alta en el catálogo de Obra.
              </Typography>
            )}

            {obrasSeleccionadas.length === 0 ? (
              <Typography sx={{ fontSize: 13, color: DOC_LIGHT.textFaint }}>
                Selecciona al menos una Obra para ver los materiales de esta etapa.
              </Typography>
            ) : loadingPreview ? (
              <Stack alignItems="center" sx={{ py: 2 }}>
                <CircularProgress size={18} />
              </Stack>
            ) : (
              <Box sx={{ overflowX: "auto" }}>
                <Box component="table" sx={{ width: "100%", borderCollapse: "collapse" }}>
                  <Box component="thead">
                    <Box component="tr">
                      {["Material", "Cantidad", "Precio unitario", "Importe"].map((h, i) => (
                        <Box
                          component="th"
                          key={h}
                          sx={{
                            textAlign: i === 0 ? "left" : "right",
                            fontSize: 11,
                            color: DOC_LIGHT.textFaint,
                            textTransform: "uppercase",
                            letterSpacing: 0.5,
                            pb: 1,
                            borderBottom: `1px solid ${DOC_LIGHT.divider}`,
                          }}
                        >
                          {h}
                        </Box>
                      ))}
                    </Box>
                  </Box>
                  <Box component="tbody">
                    {lineasPreview.length === 0 ? (
                      <Box component="tr">
                        <Box component="td" colSpan={4} sx={{ py: 3, textAlign: "center", color: DOC_LIGHT.textMuted, fontSize: 13 }}>
                          Ninguna de las Obras seleccionadas tiene conceptos con Material asignado en esta etapa.
                        </Box>
                      </Box>
                    ) : (
                      lineasPreview.map((l) => (
                        <Box
                          component="tr"
                          key={l.idMaterial}
                          sx={{ "& td": { borderBottom: `1px solid ${DOC_LIGHT.divider}`, py: 1.25, fontSize: 13, color: DOC_LIGHT.text } }}
                        >
                          <Box component="td">{l.materialNombre}</Box>
                          <Box component="td" sx={{ textAlign: "right" }}>
                            {l.cantidadTotal}
                          </Box>
                          <Box component="td" sx={{ textAlign: "right" }}>
                            {moneda(l.precioUnitario)}
                          </Box>
                          <Box component="td" sx={{ textAlign: "right", fontWeight: 600 }}>
                            {moneda(l.importe)}
                          </Box>
                        </Box>
                      ))
                    )}
                  </Box>
                  {lineasPreview.length > 0 && (
                    <Box component="tfoot">
                      <Box component="tr">
                        <Box component="td" colSpan={3} sx={{ pt: 1.5, textAlign: "right", fontSize: 13, color: DOC_LIGHT.textMuted }}>
                          Total etapa
                        </Box>
                        <Box component="td" sx={{ pt: 1.5, textAlign: "right", fontSize: 15, fontWeight: 700, color: DOC_LIGHT.text }}>
                          {moneda(total)}
                        </Box>
                      </Box>
                    </Box>
                  )}
                </Box>
              </Box>
            )}
          </DocPanel>

          <DocPanel title="Comentarios" tokens={DOC_LIGHT}>
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
              sx={{ color: DOC_LIGHT.textMuted, textTransform: "none" }}
            >
              Cancelar
            </Button>
            <Button
              size="small"
              variant="contained"
              onClick={handleGenerar}
              disabled={saving}
              sx={{ textTransform: "none", bgcolor: DOC_LIGHT.accent, "&:hover": { bgcolor: "#a75f22" } }}
            >
              {saving ? <CircularProgress size={16} /> : "Generar requisición"}
            </Button>
          </Stack>
        </Stack>
      </Box>
    </AppShell>
  );
}
