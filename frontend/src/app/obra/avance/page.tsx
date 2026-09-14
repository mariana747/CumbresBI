"use client";

import { Fragment, useEffect, useMemo, useState } from "react";
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
  FormControl,
  IconButton,
  InputLabel,
  MenuItem,
  Paper,
  Select,
  Stack,
  Tab,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Tabs,
  TextField,
  Tooltip,
  Typography,
} from "@mui/material";
import { Camera, CheckCircle2, HardHat, X as CloseIcon } from "lucide-react";
import AppShell from "@/components/AppShell";
import { SessionUser, getSession } from "@/lib/auth";
import {
  ObraConcepto,
  ObraEstimacion,
  ObraEtapa,
  ObraEvidencia,
  ObraLote,
  createEstimacion,
  createEvidencia,
  deleteEstimacion,
  updateEstimacion,
  listConceptos,
  listEstimaciones,
  listEtapas,
  listEvidencias,
  listLotes,
  revisarEvidencia,
} from "@/lib/obra";
import { OBRA_AVANCE_PALETTE, OBRA_ETAPA_COLORS, OBRA_TAB_BAR_BG } from "@/theme/theme";

const TODOS = "__todos__";
const FASES = [1, 2, 3, 4];

// Colores establecidos por etapa (uno por pestaña, ciclico) - viven en el
// theme (theme/theme.ts, OBRA_ETAPA_COLORS), no hardcodeados aqui, mismo
// criterio que SCOPE_PALETTE.
function colorEtapa(index: number) {
  return OBRA_ETAPA_COLORS[index % OBRA_ETAPA_COLORS.length];
}

// Leyenda de colores del Excel legado - el color de la celda de avance
// depende del % acumulado, no es decorativo.
// Los hex viven en theme/theme.ts (OBRA_AVANCE_PALETTE), aqui solo se
// referencian junto con su etiqueta/descripcion para la leyenda.
const LEYENDA_COLORES = [
  { estado: "FALTA", color: OBRA_AVANCE_PALETTE.falta, descripcion: "0% — no se ha capturado avance" },
  { estado: "SOBREESTIMADO", color: OBRA_AVANCE_PALETTE.sobreestimado, descripcion: "Más de 100% acumulado" },
  {
    estado: "SIN INFORMACIÓN",
    color: OBRA_AVANCE_PALETTE.sinInformacion,
    descripcion: "Sin estimaciones registradas",
  },
  { estado: "COMPLETO", color: OBRA_AVANCE_PALETTE.completo, descripcion: "100% acumulado" },
];

// "ALBAÑILERIAS : TRAZO Y NIVELACION, ..." -> "ALBAÑILERIAS" - solo el
// oficio/rubro antes de los dos puntos; la descripcion completa se
// muestra emergente (Tooltip), no en la celda. Si no hay ":" se deja tal
// cual (algunos conceptos del Excel no siguen ese patron, ej.
// Extraordinarios).
function tituloConcepto(descripcion: string): string {
  const idx = descripcion.indexOf(":");
  return idx > 0 ? descripcion.slice(0, idx).trim() : descripcion;
}

// Color de la celda segun el % acumulado (concepto+lote) - explicado por
// Mariana: todo arranca en 0; FALTA es que ya hay % capturado pero no
// llega a 100 (va en proceso); SOBREESTIMADO es mas de 100%; SIN
// INFORMACION es que el trabajo ya se realizo (hay evidencia/foto) pero
// nadie capturo el % - por eso necesita `hayEvidencia`, no se puede saber
// solo con el %. Si no hay ni % ni evidencia, es el "0" base - no se
// pinta, no es una excepcion que valga la pena señalar.
function colorPorAvance(total: number | null, hayEvidencia: boolean): string | undefined {
  if (total === null || total === 0) {
    return hayEvidencia ? OBRA_AVANCE_PALETTE.sinInformacion : undefined;
  }
  if (total > 1) return OBRA_AVANCE_PALETTE.sobreestimado;
  if (total === 1) return OBRA_AVANCE_PALETTE.completo;
  return OBRA_AVANCE_PALETTE.falta; // 0% < total < 100%, en proceso
}

// Vista de avance por etapa/concepto/lote - reusa a proposito la
// nomenclatura del Excel legado "PORCENTAJE AVANCE_015631.xlsx": filtros
// de Proyecto/Fase arriba, Avance Total a la derecha, tabla con TODOS los
// lotes como columnas (sin truncar) y una columna de Evidencia con
// boton para subir/revisar foto por concepto+lote (minuta_reunion-1.md
// sec. 1 y 2). La actualizacion es diaria y en vivo - el corte oficial
// (snapshot del viernes, validado por el Supervisor de Obra) se revisa en
// /obra/cortes, no aqui.
export default function ObraAvancePage() {
  const [session, setSession] = useState<SessionUser | null>(null);
  const [etapas, setEtapas] = useState<ObraEtapa[]>([]);
  const [conceptos, setConceptos] = useState<ObraConcepto[]>([]);
  const [lotes, setLotes] = useState<ObraLote[]>([]);
  const [estimaciones, setEstimaciones] = useState<ObraEstimacion[]>([]);
  const [evidencias, setEvidencias] = useState<ObraEvidencia[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [etapaTab, setEtapaTab] = useState<string | null>(null);
  const [proyectoFiltro, setProyectoFiltro] = useState(TODOS);
  const [lugarFiltro, setLugarFiltro] = useState(TODOS);
  const [ciudadFiltro, setCiudadFiltro] = useState(TODOS);
  const [faseFiltro, setFaseFiltro] = useState(1);
  const [loteFiltro, setLoteFiltro] = useState(TODOS);
  const [conceptoFiltro, setConceptoFiltro] = useState(TODOS);

  const [evidenciaDialog, setEvidenciaDialog] = useState<ObraConcepto | null>(null);
  const [loteEvidencia, setLoteEvidencia] = useState("");
  const [linkDrive, setLinkDrive] = useState("");
  const [comentarios, setComentarios] = useState("");
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  // Edicion en linea: clic en la celda %/EST de un concepto+lote para
  // agregar la siguiente estimacion (semana) de una vez, sin salir de la
  // tabla.
  // editando: la estimacion existente cuando se hace clic en una semana ya
  // capturada (obra.editar) - null cuando es alta de una semana nueva
  // (obra.crear), ver abrirEstimacion.
  const [estimacionDialog, setEstimacionDialog] = useState<{
    concepto: ObraConcepto;
    lote: ObraLote;
    editando: ObraEstimacion | null;
  } | null>(null);
  const [porcentajeNuevo, setPorcentajeNuevo] = useState("");
  const [fechaNueva, setFechaNueva] = useState(new Date().toISOString().slice(0, 10));
  const [estimacionError, setEstimacionError] = useState<string | null>(null);
  const [savingEstimacion, setSavingEstimacion] = useState(false);

  useEffect(() => {
    getSession().then(setSession);
  }, []);

  const puedeCrear = session?.perm_keys.includes("obra.crear") ?? false;
  const puedeEditar = session?.perm_keys.includes("obra.editar") ?? false;
  const puedeAprobar = session?.perm_keys.includes("obra.aprobar") ?? false;

  function refresh() {
    setLoading(true);
    Promise.all([listEtapas(), listConceptos(), listLotes(), listEstimaciones(), listEvidencias()])
      .then(([e, c, l, est, ev]) => {
        setEtapas(e);
        setConceptos(c);
        setLotes(l);
        setEstimaciones(est);
        setEvidencias(ev);
      })
      .catch((err) => setError(err instanceof Error ? err.message : "Error desconocido"))
      .finally(() => setLoading(false));
  }

  useEffect(refresh, []);

  // Selecciona la primera etapa como pestaña activa apenas llegan los
  // datos - misma dinamica que el Excel legado (una hoja por etapa).
  useEffect(() => {
    if (!etapaTab && etapas.length > 0) {
      setEtapaTab(etapas[0].id_etapa);
    }
  }, [etapas, etapaTab]);

  const proyectos = useMemo(() => Array.from(new Set(lotes.map((l) => l.proyecto))), [lotes]);
  const lugares = useMemo(
    () => Array.from(new Set(lotes.map((l) => l.lugar).filter((v): v is string => Boolean(v)))),
    [lotes]
  );
  const ciudades = useMemo(
    () => Array.from(new Set(lotes.map((l) => l.ciudad).filter((v): v is string => Boolean(v)))),
    [lotes]
  );

  const lotesFiltrados = useMemo(
    () =>
      lotes.filter(
        (l) =>
          (proyectoFiltro === TODOS || l.proyecto === proyectoFiltro) &&
          (lugarFiltro === TODOS || l.lugar === lugarFiltro) &&
          (ciudadFiltro === TODOS || l.ciudad === ciudadFiltro) &&
          (loteFiltro === TODOS || l.id_lote === loteFiltro)
      ),
    [lotes, proyectoFiltro, lugarFiltro, ciudadFiltro, loteFiltro]
  );

  const conceptosFiltrados = useMemo(
    () => conceptos.filter((c) => conceptoFiltro === TODOS || c.id_concepto === conceptoFiltro),
    [conceptos, conceptoFiltro]
  );

  const conceptoSeleccionado = useMemo(
    () => conceptos.find((c) => c.id_concepto === conceptoFiltro) ?? null,
    [conceptos, conceptoFiltro]
  );

  // Acumulado por concepto+lote (suma de porcentaje de todas sus
  // estimaciones capturadas hasta hoy, igual que la columna "TOTAL %" del
  // Excel) - no distingue semana de fase, es el avance real acumulado.
  // Ausente en el mapa (undefined) = SIN INFORMACION (nunca se capturo
  // nada), distinto de un 0% explicito = FALTA - ver colorPorAvance.
  const totalPorConceptoLote = useMemo(() => {
    const totales = new Map<string, number>();
    for (const est of estimaciones) {
      const clave = `${est.concepto}-${est.lote}`;
      totales.set(clave, (totales.get(clave) ?? 0) + Number(est.porcentaje));
    }
    return totales;
  }, [estimaciones]);

  // Renglones de semana por concepto+lote, ordenados por numero_estimacion
  // (folio real del Excel, no un contador nuestro) - cada uno se apila
  // como una linea dentro de la misma celda de %/EST, igual que las filas
  // hijas del Excel legado.
  const estimacionesPorConceptoLote = useMemo(() => {
    const mapa = new Map<string, ObraEstimacion[]>();
    for (const est of estimaciones) {
      const clave = `${est.concepto}-${est.lote}`;
      const lista = mapa.get(clave) ?? [];
      lista.push(est);
      mapa.set(clave, lista);
    }
    for (const lista of mapa.values()) {
      lista.sort((a, b) => a.numero_estimacion - b.numero_estimacion);
    }
    return mapa;
  }, [estimaciones]);

  // Agrupado solo por concepto (no por lote) - la columna de Evidencia
  // resume el estado de TODOS los lotes de ese concepto, para no tener que
  // filtrar a un solo lote para poder subir/revisar fotos.
  const evidenciasPorConcepto = useMemo(() => {
    const mapa = new Map<string, ObraEvidencia[]>();
    for (const ev of evidencias) {
      const lista = mapa.get(ev.concepto) ?? [];
      lista.push(ev);
      mapa.set(ev.concepto, lista);
    }
    return mapa;
  }, [evidencias]);

  // Set de "concepto-lote" con al menos una evidencia - usado para
  // distinguir SIN INFORMACION (hay foto, no hay %) del "0" base sin
  // ninguna señal (ver colorPorAvance).
  const conceptoLoteConEvidencia = useMemo(() => {
    const set = new Set<string>();
    for (const ev of evidencias) {
      set.add(`${ev.concepto}-${ev.lote}`);
    }
    return set;
  }, [evidencias]);

  const conceptosPorEtapa = useMemo(() => {
    const grupos = new Map<string, ObraConcepto[]>();
    for (const c of conceptosFiltrados) {
      const lista = grupos.get(c.etapa) ?? [];
      lista.push(c);
      grupos.set(c.etapa, lista);
    }
    return grupos;
  }, [conceptosFiltrados]);

  // Avance total = cuantas celdas concepto x lote visibles (con el filtro
  // actual) ya llegaron a 100% (COMPLETO), sobre el total de celdas - no
  // un promedio de los % acumulados.
  // Promedio ponderado por % - suma el % acumulado real de cada celda
  // concepto x lote visible (no solo si llego a 100%) y lo divide entre
  // el total de celdas, para reflejar el avance real aunque este parcial.
  const avanceTotal = useMemo(() => {
    let suma = 0;
    let cuenta = 0;
    for (const c of conceptosFiltrados) {
      for (const l of lotesFiltrados) {
        const total = totalPorConceptoLote.get(`${c.id_concepto}-${l.id_lote}`) ?? 0;
        suma += total;
        cuenta += 1;
      }
    }
    return cuenta > 0 ? Math.round((suma / cuenta) * 100) : 0;
  }, [conceptosFiltrados, lotesFiltrados, totalPorConceptoLote]);

  function abrirEvidencia(concepto: ObraConcepto) {
    setEvidenciaDialog(concepto);
    setLoteEvidencia(lotes[0]?.id_lote ?? "");
    setLinkDrive("");
    setComentarios("");
    setFormError(null);
  }

  async function handleSubirEvidencia() {
    if (!evidenciaDialog) return;
    if (!loteEvidencia) {
      setFormError("Selecciona el lote.");
      return;
    }
    setSaving(true);
    setFormError(null);
    try {
      await createEvidencia({
        concepto: evidenciaDialog.id_concepto,
        lote: loteEvidencia,
        linkDrive: linkDrive || null,
        fechaCaptura: new Date().toISOString().slice(0, 10),
        comentarios: comentarios || null,
      });
      setEvidenciaDialog(null);
      refresh();
    } catch (err) {
      setFormError(err instanceof Error ? err.message : "Error desconocido");
    } finally {
      setSaving(false);
    }
  }

  async function handleRevisar(ev: ObraEvidencia) {
    if (!session) return;
    try {
      await revisarEvidencia(ev.id_evidencia, session.user_id);
      refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error desconocido");
    }
  }

  // editando=null -> alta de la siguiente semana vacia (obra.crear).
  // editando=estimacion -> edicion de una semana ya capturada (obra.editar).
  function abrirEstimacion(concepto: ObraConcepto, lote: ObraLote, editando: ObraEstimacion | null) {
    setEstimacionDialog({ concepto, lote, editando });
    setPorcentajeNuevo(editando ? String(Math.round(Number(editando.porcentaje) * 100)) : "");
    setFechaNueva(editando ? editando.fecha_captura : new Date().toISOString().slice(0, 10));
    setEstimacionError(null);
  }

  async function handleGuardarEstimacion() {
    if (!estimacionDialog) return;
    const valor = Number(porcentajeNuevo);
    if (!porcentajeNuevo || Number.isNaN(valor) || valor <= 0 || valor > 120) {
      setEstimacionError("Captura un % válido (1-120).");
      return;
    }
    setSavingEstimacion(true);
    setEstimacionError(null);
    try {
      if (estimacionDialog.editando) {
        await updateEstimacion(estimacionDialog.editando.id_estimacion, {
          porcentaje: (valor / 100).toFixed(4),
          fechaCaptura: fechaNueva,
        });
      } else {
        await createEstimacion({
          concepto: estimacionDialog.concepto.id_concepto,
          lote: estimacionDialog.lote.id_lote,
          porcentaje: (valor / 100).toFixed(4),
          fechaCaptura: fechaNueva,
        });
      }
      setEstimacionDialog(null);
      refresh();
    } catch (err) {
      setEstimacionError(err instanceof Error ? err.message : "Error desconocido");
    } finally {
      setSavingEstimacion(false);
    }
  }

  // Borra una estimacion capturada por error - solo aplica cuando el
  // dialogo esta editando una semana existente, no en alta.
  async function handleBorrarEstimacion() {
    if (!estimacionDialog?.editando) return;
    if (!window.confirm(`¿Borrar la estimación de ${Math.round(Number(estimacionDialog.editando.porcentaje) * 100)}% (folio ${estimacionDialog.editando.numero_estimacion})? No se puede deshacer.`)) {
      return;
    }
    setSavingEstimacion(true);
    setEstimacionError(null);
    try {
      await deleteEstimacion(estimacionDialog.editando.id_estimacion);
      setEstimacionDialog(null);
      refresh();
    } catch (err) {
      setEstimacionError(err instanceof Error ? err.message : "Error desconocido");
    } finally {
      setSavingEstimacion(false);
    }
  }

  // Selecciona una de las 4 tarjetas de semana dentro del dialogo abierto -
  // si esa semana ya tiene datos, cambia a modo edicion de ESA estimacion;
  // si esta vacia, cambia a modo alta (misma concepto+lote).
  function seleccionarSemana(estimacion: ObraEstimacion | null) {
    if (!estimacionDialog) return;
    setEstimacionDialog({ ...estimacionDialog, editando: estimacion });
    setPorcentajeNuevo(estimacion ? String(Math.round(Number(estimacion.porcentaje) * 100)) : "");
    setFechaNueva(estimacion ? estimacion.fecha_captura : new Date().toISOString().slice(0, 10));
    setEstimacionError(null);
  }

  return (
    <AppShell>
      <Stack direction="row" alignItems="center" spacing={1.5} sx={{ mb: 0.5 }}>
        <HardHat size={22} strokeWidth={1.5} />
        <Typography variant="h5">Avance de Obra</Typography>
      </Stack>
      <Typography variant="body2" color="text.secondary" sx={{ mb: 3 }}>
        Avance por etapa, concepto y lote — misma vista y nomenclatura del control de avance en Excel.
        Actualización diaria y en vivo; el corte oficial de cada viernes se revisa y valida en{" "}
        <strong>Cortes semanales</strong>.
      </Typography>

      {error && (
        <Alert severity="error" sx={{ mb: 3 }}>
          {error}
        </Alert>
      )}

      <Stack direction={{ xs: "column", md: "row" }} spacing={2} sx={{ mb: 3 }} alignItems={{ md: "stretch" }}>
        {/* Grupo 1: filtros + Avance Total, en su propio Paper - no
        comparte recuadro con la leyenda. */}
        <Paper variant="outlined" sx={{ flex: 1, p: 2 }}>
        <Stack
          direction={{ xs: "column", sm: "row" }}
          spacing={1}
          alignItems={{ sm: "center" }}
          flexWrap="wrap"
          useFlexGap
        >
          <FormControl size="small" sx={{ minWidth: 110, flex: 1 }}>
            <InputLabel id="proyecto-label">Proyecto</InputLabel>
            <Select
              labelId="proyecto-label"
              label="Proyecto"
              value={proyectoFiltro}
              onChange={(e) => setProyectoFiltro(e.target.value)}
            >
              <MenuItem value={TODOS}>Todos</MenuItem>
              {proyectos.map((p) => (
                <MenuItem key={p} value={p}>
                  {p}
                </MenuItem>
              ))}
            </Select>
          </FormControl>

          <FormControl size="small" sx={{ minWidth: 100, flex: 1 }}>
            <InputLabel id="lugar-label">Lugar</InputLabel>
            <Select labelId="lugar-label" label="Lugar" value={lugarFiltro} onChange={(e) => setLugarFiltro(e.target.value)}>
              <MenuItem value={TODOS}>Todos</MenuItem>
              {lugares.map((lugar) => (
                <MenuItem key={lugar} value={lugar}>
                  {lugar}
                </MenuItem>
              ))}
            </Select>
          </FormControl>

          <FormControl size="small" sx={{ minWidth: 100, flex: 1 }}>
            <InputLabel id="ciudad-label">Ciudad</InputLabel>
            <Select labelId="ciudad-label" label="Ciudad" value={ciudadFiltro} onChange={(e) => setCiudadFiltro(e.target.value)}>
              <MenuItem value={TODOS}>Todos</MenuItem>
              {ciudades.map((ciudad) => (
                <MenuItem key={ciudad} value={ciudad}>
                  {ciudad}
                </MenuItem>
              ))}
            </Select>
          </FormControl>

          <FormControl size="small" sx={{ minWidth: 100, flex: 1 }}>
            <InputLabel id="lote-label">Lote</InputLabel>
            <Select labelId="lote-label" label="Lote" value={loteFiltro} onChange={(e) => setLoteFiltro(e.target.value)}>
              <MenuItem value={TODOS}>Todos</MenuItem>
              {lotes.map((l) => (
                <MenuItem key={l.id_lote} value={l.id_lote}>
                  Lote {l.numero_lote}
                </MenuItem>
              ))}
            </Select>
          </FormControl>
          {/* Solo el numero en la lista - la nomenclatura (descripcion
          completa) va a un lado, no mezclada en el mismo renglon. */}
          <FormControl size="small" sx={{ minWidth: 90, flex: 1 }}>
            <InputLabel id="concepto-label">Concepto</InputLabel>
            <Select
              labelId="concepto-label"
              label="Concepto"
              value={conceptoFiltro}
              onChange={(e) => setConceptoFiltro(e.target.value)}
            >
              <MenuItem value={TODOS}>Todos</MenuItem>
              {/* Los conceptos "E.n" son Extraordinarios (su propia
              etapa/pestaña) - no aportan al filtro de conceptos regulares. */}
              {conceptos
                .filter((c) => !c.numero.startsWith("E"))
                .map((c) => (
                  <MenuItem key={c.id_concepto} value={c.id_concepto}>
                    {c.numero}
                  </MenuItem>
                ))}
            </Select>

            
          </FormControl>
          {/* Leyenda de colores a la izquierda del % de Avance Total,
          misma fila - no como bloque aparte abajo. */}

          {/* Borde + sombreado con el color del theme segun el avance
          (completo=verde, resto=azul) - no relleno solido. */}
          <Box
            sx={{
              textAlign: "center",
              px: 1.5,
              py: 0.5,
              flexShrink: 0,
              borderRadius: 1,
              border: "2px solid",
              borderColor: avanceTotal >= 100 ? OBRA_AVANCE_PALETTE.completo : OBRA_AVANCE_PALETTE.falta,
              boxShadow: `0 0 8px ${avanceTotal >= 100 ? OBRA_AVANCE_PALETTE.completo : OBRA_AVANCE_PALETTE.falta}66`,
            }}
          >
            <Typography variant="caption" color="text.secondary" display="block">
              Avance Total
            </Typography>
            <Typography variant="h5" fontWeight={700}>
              {avanceTotal}%
            </Typography>
          </Box>

        </Stack>
        </Paper>

        {/* Grupo 2: leyenda de colores, en su propio Paper. */}
        <Paper variant="outlined" sx={{ p: 1.5 }}>
          <Stack spacing={0.75}>
            {LEYENDA_COLORES.map((item) => (
              <Stack key={item.estado} direction="row" spacing={0.75} alignItems="center">
                <Box sx={{ width: 12, height: 12, borderRadius: "2px", bgcolor: item.color }} />
                <Typography variant="caption" color="text.secondary">
                  {item.estado}
                </Typography>
              </Stack>
            ))}
          </Stack>
        </Paper>
      </Stack>

      {/* Nomenclatura en su propio contenedor, separado del de filtros. */}
      {conceptoFiltro !== TODOS && conceptoSeleccionado && (
        <Paper variant="outlined" sx={{ mb: 3, p: 1.5, bgcolor: "action.hover" }}>
          <Typography variant="caption" color="text.secondary" display="block">
            Nomenclatura — {conceptoSeleccionado.numero}
          </Typography>
          <Typography variant="body2">{conceptoSeleccionado.descripcion}</Typography>
          <Typography variant="caption" color="text.secondary">
            Maestro: {conceptoSeleccionado.maestro || "—"}
          </Typography>
        </Paper>
      )}

      <Paper variant="outlined">
        {loading ? (
          <Box sx={{ py: 4, textAlign: "center" }}>
            <CircularProgress size={20} />
          </Box>
        ) : etapas.length === 0 ? (
          <Box sx={{ py: 4, textAlign: "center" }}>
            <Typography variant="body2" color="text.secondary">
              Sin etapas registradas todavía.
            </Typography>
          </Box>
        ) : (
          <>
            {/* Una pestaña por etapa - misma dinamica y look que las hojas
            del Excel legado (barra oscura, pestaña activa en blanco con
            borde de color abajo). Numero y nombre apilados en columna
            dentro de la propia pestaña. */}
            <Tabs
              value={etapaTab ?? etapas[0].id_etapa}
              onChange={(_, value) => setEtapaTab(value)}
              variant="scrollable"
              scrollButtons="auto"
              sx={{
                bgcolor: OBRA_TAB_BAR_BG,
                minHeight: 0,
                "& .MuiTabs-indicator": { display: "none" },
              }}
            >
              {etapas.map((etapa, index) => (
                <Tab
                  key={etapa.id_etapa}
                  value={etapa.id_etapa}
                  label={
                    <Stack alignItems="center" spacing={0.25}>
                      <Typography variant="caption" fontWeight={700} sx={{ lineHeight: 1.1 }}>
                        {etapa.numero}
                      </Typography>
                      <Typography variant="caption" sx={{ lineHeight: 1.1, fontSize: "0.65rem" }}>
                        {etapa.nombre}
                      </Typography>
                    </Stack>
                  }
                  sx={{
                    minWidth: 110,
                    minHeight: 0,
                    py: 1,
                    color: "common.white",
                    bgcolor: OBRA_TAB_BAR_BG,
                    "&.Mui-selected": {
                      color: "common.black",
                      bgcolor: "common.white",
                      borderBottom: 3,
                      borderColor: colorEtapa(index),
                    },
                  }}
                />
              ))}
            </Tabs>
            {etapas
              .filter((etapa) => etapa.id_etapa === (etapaTab ?? etapas[0].id_etapa))
              .map((etapa) => {
                const conceptosEtapa = conceptosPorEtapa.get(etapa.id_etapa) ?? [];
                return (
                  <Box key={etapa.id_etapa} sx={{ px: 2, pb: 2 }}>
                    {conceptosEtapa.length === 0 ? (
                      <Typography variant="body2" color="text.secondary" sx={{ py: 3, textAlign: "center" }}>
                        Sin conceptos en esta etapa con el filtro actual.
                      </Typography>
                    ) : (
                      <TableContainer>
                        <Table
                          size="small"
                          sx={{
                            borderCollapse: "collapse",
                            "& td, & th": { border: "1px solid", borderColor: "divider" },
                          }}
                        >
                          <TableHead>
                            <TableRow>
                              <Tooltip title="Número de concepto dentro de la etapa" arrow>
                                <TableCell rowSpan={2} sx={{ width: 36, fontSize: "0.68rem" }}>
                                  No.
                                </TableCell>
                              </Tooltip>
                              <Tooltip title="Oficio/rubro del concepto — pasa el mouse sobre la descripción para verla completa" arrow>
                                <TableCell rowSpan={2} sx={{ width: 220, fontSize: "0.68rem " }}>
                                  Concepto
                                </TableCell>
                              </Tooltip>
                              <Tooltip title="Contratista/maestro responsable de ejecutar el concepto" arrow>
                                <TableCell rowSpan={2} sx={{ width: 90, fontSize: "0.68rem "  }}>
                                  Maestro
                                </TableCell>
                              </Tooltip>
                              {lotesFiltrados.map((l) => (
                                <TableCell key={l.id_lote} align="center" colSpan={3} sx={{ width: 150 }}>
                                  Lote {l.numero_lote}
                                </TableCell>
                              ))}
                              <Tooltip title="Foto de evidencia por semana — subir y marcar como revisada" arrow>
                                <TableCell rowSpan={2} align="center" sx={{ width: 80 }}>
                                  Evidencia
                                </TableCell>
                              </Tooltip>
                            </TableRow>
                            <TableRow>
                              {lotesFiltrados.map((l) => (
                                <Fragment key={l.id_lote}>
                                  <Tooltip title="% avanzado capturado esa semana" arrow>
                                    <TableCell align="center" sx={{ fontSize: "0.68rem", width: 50 }}>
                                      %
                                    </TableCell>
                                  </Tooltip>
                                  <Tooltip title="Número de estimación (folio real del proyecto)" arrow>
                                    <TableCell align="center" sx={{ fontSize: "0.68rem", width: 50 }}>
                                      EST
                                    </TableCell>
                                  </Tooltip>
                                  <Tooltip title="% acumulado de todas las semanas de este concepto en este lote" arrow>
                                    <TableCell align="center" sx={{ fontSize: "0.6rem", width: 50 }}>
                                      TOTAL
                                    </TableCell>
                                  </Tooltip>
                                </Fragment>
                              ))}
                            </TableRow>
                          </TableHead>
                          <TableBody>
                            {conceptosEtapa.map((c) => (
                              <TableRow key={c.id_concepto} hover>
                                <TableCell sx={{ width: 20, fontSize: "0.68rem" }}>{c.numero}</TableCell>
                                <TableCell sx={{ width: 220, fontSize: "0.55rem", lineHeight: 1.3 }}>
                                  <Tooltip title={c.descripcion} arrow placement="right">
                                    <Box component="span">{tituloConcepto(c.descripcion)}</Box>
                                  </Tooltip>
                                </TableCell>
                                <TableCell sx={{ width: 90, fontSize: "0.55rem" }}>{c.maestro || "—"}</TableCell>
                                {lotesFiltrados.map((l) => {
                                  const clave = `${c.id_concepto}-${l.id_lote}`;
                                  const semanas = estimacionesPorConceptoLote.get(clave) ?? [];
                                  const total = totalPorConceptoLote.get(clave) ?? null;
                                  const color = colorPorAvance(total, conceptoLoteConEvidencia.has(clave));
                                  // Siempre 4 renglones (1 fase = 4 semanas,
                                  // ver obra-fase-4-semanas-estimaciones) -
                                  // se muestran las semanas que ya se
                                  // tienen y los espacios vacios restantes.
                                  // Minimo 4 - si el historico real tiene
                                  // mas de 4 para este concepto+lote, no
                                  // se recorta.
                                  const totalSlots = Math.max(4, semanas.length);
                                  const slots: (ObraEstimacion | null)[] = Array.from(
                                    { length: totalSlots },
                                    (_, i) => semanas[i] ?? null
                                  );
                                  const primerVacio = slots.findIndex((s) => s === null);
                                  // Cualquiera de las 4 filas abre el modo
                                  // edicion - una fila ya capturada se
                                  // edita (obra.editar); una vacia se
                                  // llena (obra.crear), pero solo la
                                  // siguiente en orden - no se puede
                                  // saltar una semana sin llenar la
                                  // anterior.
                                  const puedeClic = (s: ObraEstimacion | null, i: number) =>
                                    s ? puedeEditar : puedeCrear && i === primerVacio;
                                  return (
                                    <Fragment key={l.id_lote}>
                                      <TableCell align="center" sx={{ p: 0, width: 50 }}>
                                        {slots.map((s, i) => (
                                          <Typography
                                            key={s?.id_estimacion ?? `vacio-${i}`}
                                            variant="caption"
                                            component="div"
                                            onClick={puedeClic(s, i) ? () => abrirEstimacion(c, l, s) : undefined}
                                            sx={{
                                              py: 0.5,
                                              borderTop: i > 0 ? "1px solid" : "none",
                                              borderColor: "divider",
                                              cursor: puedeClic(s, i) ? "pointer" : "default",
                                              "&:hover": puedeClic(s, i) ? { bgcolor: "action.hover" } : undefined,
                                              color: s ? "text.primary" : "text.disabled",
                                            }}
                                          >
                                            {s ? `${Math.round(Number(s.porcentaje) * 100)}%` : "—"}
                                          </Typography>
                                        ))}
                                      </TableCell>
                                      <TableCell align="center" sx={{ p: 0, width: 50 }}>
                                        {slots.map((s, i) => (
                                          <Typography
                                            key={s?.id_estimacion ?? `vacio-${i}`}
                                            variant="caption"
                                            component="div"
                                            onClick={puedeClic(s, i) ? () => abrirEstimacion(c, l, s) : undefined}
                                            sx={{
                                              py: 0.5,
                                              borderTop: i > 0 ? "1px solid" : "none",
                                              borderColor: "divider",
                                              cursor: puedeClic(s, i) ? "pointer" : "default",
                                              "&:hover": puedeClic(s, i) ? { bgcolor: "action.hover" } : undefined,
                                              color: s ? "text.primary" : "text.disabled",
                                            }}
                                          >
                                            {s ? s.numero_estimacion : "—"}
                                          </Typography>
                                        ))}
                                      </TableCell>
                                      <TableCell
                                        align="center"
                                        sx={{
                                          width: 50,
                                          ...(color ? { bgcolor: color, color: "common.black", fontWeight: 600 } : {}),
                                        }}
                                      >
                                        {total !== null ? `${Math.round(total * 100)}%` : "—"}
                                      </TableCell>
                                    </Fragment>
                                  );
                                })}
                                <TableCell align="center" sx={{ width: 80 }}>
                                  <EvidenciaCelda
                                    evidencias={evidenciasPorConcepto.get(c.id_concepto) ?? []}
                                    puedeCrear={puedeCrear}
                                    puedeAprobar={puedeAprobar}
                                    onSubir={() => abrirEvidencia(c)}
                                    onRevisar={handleRevisar}
                                  />
                                </TableCell>
                              </TableRow>
                            ))}
                          </TableBody>
                        </Table>
                      </TableContainer>
                    )}
                  </Box>
                );
              })}
          </>
        )}
      </Paper>

      <Dialog open={Boolean(evidenciaDialog)} onClose={() => setEvidenciaDialog(null)} fullWidth maxWidth="sm">
        <DialogTitle sx={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          Subir evidencia
          <IconButton onClick={() => setEvidenciaDialog(null)} size="small" aria-label="Cerrar">
            <CloseIcon size={18} strokeWidth={1.5} />
          </IconButton>
        </DialogTitle>
        <DialogContent dividers>
          {formError && (
            <Alert severity="error" sx={{ mb: 2 }}>
              {formError}
            </Alert>
          )}
          <Alert severity="info" sx={{ mb: 2 }}>
            Todavía no existe la Unidad compartida de Drive para Obra — por ahora pega el enlace de la foto ya
            subida a Drive manualmente. Cuando exista la carpeta, esto se reemplaza por subida directa.
          </Alert>
          <Stack spacing={2}>
            <FormControl size="small" fullWidth>
              <InputLabel id="lote-evidencia-label">Lote</InputLabel>
              <Select
                labelId="lote-evidencia-label"
                label="Lote"
                value={loteEvidencia}
                onChange={(e) => setLoteEvidencia(e.target.value)}
              >
                {lotes.map((l) => (
                  <MenuItem key={l.id_lote} value={l.id_lote}>
                    Lote {l.numero_lote}
                  </MenuItem>
                ))}
              </Select>
            </FormControl>
            <TextField
              size="small"
              label="Link de Drive"
              placeholder="https://drive.google.com/..."
              value={linkDrive}
              onChange={(e) => setLinkDrive(e.target.value)}
              fullWidth
            />
            <TextField
              size="small"
              label="Comentarios"
              value={comentarios}
              onChange={(e) => setComentarios(e.target.value)}
              multiline
              minRows={2}
              fullWidth
            />
          </Stack>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setEvidenciaDialog(null)}>Cancelar</Button>
          <Button variant="contained" onClick={handleSubirEvidencia} disabled={saving}>
            {saving ? <CircularProgress size={16} /> : "Guardar"}
          </Button>
        </DialogActions>
      </Dialog>

      <Dialog open={Boolean(estimacionDialog)} onClose={() => setEstimacionDialog(null)} fullWidth maxWidth="xs">
        <DialogTitle sx={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          {estimacionDialog?.editando
            ? `Editar Estimación (folio ${estimacionDialog.editando.numero_estimacion})`
            : "Nueva Estimación"}
          <IconButton onClick={() => setEstimacionDialog(null)} size="small" aria-label="Cerrar">
            <CloseIcon size={18} strokeWidth={1.5} />
          </IconButton>
        </DialogTitle>
        <DialogContent dividers>
          {estimacionDialog && (
            <>
              <Typography variant="body2" color="text.secondary" sx={{ mb: 1 }}>
                {estimacionDialog.concepto.numero} — Lote {estimacionDialog.lote.numero_lote}
              </Typography>
              {/* Semanas que ya se tienen y los espacios vacios restantes
              (1 fase = 4 semanas) - clickeables para elegir cual editar.
              Solo la primera vacia es seleccionable para alta - no se
              puede saltar una semana. */}
              <Stack direction="row" spacing={1} sx={{ mb: 2 }}>
                {(() => {
                  const clave = `${estimacionDialog.concepto.id_concepto}-${estimacionDialog.lote.id_lote}`;
                  const semanas = estimacionesPorConceptoLote.get(clave) ?? [];
                  const totalSlots = Math.max(4, semanas.length);
                  const slots = Array.from({ length: totalSlots }, (_, i) => semanas[i] ?? null);
                  const primerVacio = slots.findIndex((s) => s === null);
                  return slots.map((s, i) => {
                    const seleccionable = s ? puedeEditar : puedeCrear && i === primerVacio;
                    const seleccionada = s
                      ? s.id_estimacion === estimacionDialog.editando?.id_estimacion
                      : !estimacionDialog.editando && i === primerVacio;
                    return (
                      <Paper
                        key={s?.id_estimacion ?? `vacio-${i}`}
                        variant="outlined"
                        onClick={seleccionable ? () => seleccionarSemana(s) : undefined}
                        sx={{
                          flex: 1,
                          p: 1,
                          textAlign: "center",
                          cursor: seleccionable ? "pointer" : "default",
                          bgcolor: s ? "action.selected" : "transparent",
                          borderColor: seleccionada ? "primary.main" : undefined,
                          borderWidth: seleccionada ? 2 : 1,
                        }}
                      >
                        <Typography variant="caption" color="text.secondary" display="block">
                          Semana {i + 1}
                        </Typography>
                        <Typography variant="body2" fontWeight={600}>
                          {s ? `${Math.round(Number(s.porcentaje) * 100)}%` : "—"}
                        </Typography>
                      </Paper>
                    );
                  });
                })()}
              </Stack>
            </>
          )}
          {estimacionError && (
            <Alert severity="error" sx={{ mb: 2 }}>
              {estimacionError}
            </Alert>
          )}
          <Stack spacing={2}>
            <TextField
              size="small"
              label="% avanzado"
              type="number"
              value={porcentajeNuevo}
              onChange={(e) => setPorcentajeNuevo(e.target.value)}
              fullWidth
              autoFocus
            />
            <TextField
              size="small"
              label="Fecha de captura"
              type="date"
              value={fechaNueva}
              onChange={(e) => setFechaNueva(e.target.value)}
              InputLabelProps={{ shrink: true }}
              fullWidth
            />
          </Stack>
        </DialogContent>
        <DialogActions>
          {estimacionDialog?.editando && puedeEditar && (
            <Button color="error" onClick={handleBorrarEstimacion} disabled={savingEstimacion} sx={{ mr: "auto" }}>
              Borrar
            </Button>
          )}
          <Button onClick={() => setEstimacionDialog(null)}>Cancelar</Button>
          <Button variant="contained" onClick={handleGuardarEstimacion} disabled={savingEstimacion}>
            {savingEstimacion ? <CircularProgress size={16} /> : "Guardar"}
          </Button>
        </DialogActions>
      </Dialog>
    </AppShell>
  );
}

// Resume el estado de evidencia de TODOS los lotes de un concepto (no de
// uno solo) - el boton de camara siempre abre el dialogo para subir a
// cualquier lote; el chip muestra cuantas siguen pendientes de revisar.
function EvidenciaCelda({
  evidencias,
  puedeCrear,
  puedeAprobar,
  onSubir,
  onRevisar,
}: {
  evidencias: ObraEvidencia[];
  puedeCrear: boolean;
  puedeAprobar: boolean;
  onSubir: () => void;
  onRevisar: (ev: ObraEvidencia) => void;
}) {
  const pendientes = evidencias.filter((ev) => !ev.revisado);
  return (
    <Stack direction="row" spacing={0.5} alignItems="center" justifyContent="center">
      {puedeCrear && (
        <IconButton size="small" aria-label="Subir evidencia" onClick={onSubir}>
          <Camera size={16} strokeWidth={1.5} />
        </IconButton>
      )}
      {evidencias.length > 0 && (
        <Chip
          size="small"
          label={pendientes.length > 0 ? `${pendientes.length} pendiente(s)` : `${evidencias.length} revisada(s)`}
          color={pendientes.length > 0 ? "warning" : "success"}
          variant="outlined"
        />
      )}
      {pendientes.length > 0 && puedeAprobar && (
        <IconButton size="small" aria-label="Revisar evidencia" onClick={() => onRevisar(pendientes[0])}>
          <CheckCircle2 size={16} strokeWidth={1.5} />
        </IconButton>
      )}
    </Stack>
  );
}
