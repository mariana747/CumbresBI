"use client";

import { memo, useCallback, useEffect, useState } from "react";
import {
  Alert,
  Box,
  Button,
  Checkbox,
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
  TablePagination,
  TableRow,
  Tabs,
  TextField,
  Typography,
} from "@mui/material";
import { ExternalLink, Eye, FileSpreadsheet, X as CloseIcon } from "lucide-react";
import AppShell from "@/components/AppShell";
import ContratoSelector from "@/components/ContratoSelector";
import DocumentoPreviewDialog from "@/components/DocumentoPreviewDialog";
import FiltrosBar from "@/components/FiltrosBar";
import PanelReferenciaCruzada, { ReferenciaCruzada } from "@/components/PanelReferenciaCruzada";
import { getSession, SessionUser } from "@/lib/auth";
import { GeneralSociedad, listSociedades } from "@/lib/iam";
import {
  aprobarLoteCfdi,
  ConciliacionCfdiFila,
  ConciliacionCfdiResponse,
  enviarRecordatorioFlujo,
  getConciliacionCfdi,
  getSugerenciasCfdi,
  getSugerenciasCfdiLote,
  SugerenciaCfdiLote,
  SugerenciasCfdiResponse,
  TesoreriaContrato,
  exportarConciliacionCfdiSheets,
  descargarConciliacionCfdiCsv,
  urlVerComplementoPagoPdf,
  urlVerFacturaPdf,
  vincularFactura,
} from "@/lib/tesoreria";
import { useExportarSheets } from "@/lib/useExportarSheets";

// Default: mes corriente completo, como valor visible de los campos de
// fecha (10/Sep/2026, "no es por periodo debe ser por rango de fecha o una
// sola fecha") - mismo default que aplica el backend cuando no se manda
// nada, pero explicito aqui para que el usuario vea que rango esta viendo.
function primerDiaDelMes(): string {
  const hoy = new Date();
  return `${hoy.getFullYear()}-${String(hoy.getMonth() + 1).padStart(2, "0")}-01`;
}

function ultimoDiaDelMes(): string {
  const hoy = new Date();
  return new Date(hoy.getFullYear(), hoy.getMonth() + 1, 0).toISOString().slice(0, 10);
}

function numero(valor: string | null | undefined): string {
  if (valor === null || valor === undefined) return "—";
  return Number(valor).toLocaleString("es-MX", { style: "currency", currency: "MXN" });
}

const VACIO: ConciliacionCfdiResponse = {
  con_cfdi: { results: [], count: 0 },
  sin_cfdi: { results: [], count: 0 },
  no_requiere: { results: [], count: 0 },
};

const TAB_A_BUCKET: Record<TabPrincipal, keyof ConciliacionCfdiResponse> = {
  ligado: "con_cfdi",
  sin_cfdi: "sin_cfdi",
  no_requiere: "no_requiere",
};

type TabPrincipal = "ligado" | "sin_cfdi" | "no_requiere";

interface SugerenciasTabsProps {
  sugerencias: SugerenciasCfdiResponse;
  filtroBusquedaMonto: string;
  timbreUuid: string;
  esComplemento: boolean;
  onUsar: (uuid: string, esComp: boolean) => void;
  numero: (v: string | number | null | undefined) => string;
}

const SugerenciasTabs = memo(function SugerenciasTabs({
  sugerencias, filtroBusquedaMonto, timbreUuid, esComplemento, onUsar, numero,
}: SugerenciasTabsProps) {
  const todos = sugerencias.facturas.map((s) => ({ ...s, _tipo: "factura" as const }));
  const etiquetas = Array.from(new Set(todos.map((s) => s.razon_busqueda || "Otros")));
  if (sugerencias.sugerencia_ia) etiquetas.push("IA");

  const [tabEtiqueta, setTabEtiqueta] = useState<string>(etiquetas[0] ?? "");
  const [page, setPage] = useState(0);
  const ROWS_PER_PAGE = 10;
  const tabActual = etiquetas.includes(tabEtiqueta) ? tabEtiqueta : etiquetas[0] ?? "";

  const itemsTab = tabActual === "IA" ? [] : todos.filter(
    (s) => (s.razon_busqueda || "Otros") === tabActual &&
    (!filtroBusquedaMonto || String(s.total).includes(filtroBusquedaMonto))
  );
  const itemsPagina = itemsTab.slice(page * ROWS_PER_PAGE, (page + 1) * ROWS_PER_PAGE);

  return (
    <>
      <Tabs
        value={tabActual}
        onChange={(_, v) => { setTabEtiqueta(v); setPage(0); }}
        sx={{ borderBottom: "1px solid", borderColor: "divider", mb: 1 }}
        variant="scrollable"
        scrollButtons="auto"
      >
        {etiquetas.map((et) => (
          <Tab key={et} value={et} label={et} sx={{ fontSize: "0.75rem", minHeight: 36, py: 0.5 }} />
        ))}
      </Tabs>
      {tabActual === "IA" && sugerencias.sugerencia_ia ? (
        <Stack direction="row" spacing={1} alignItems="center" sx={{ border: 1, borderColor: "info.main", borderRadius: 1, p: 1, mt: 1 }}>
          <Box sx={{ flex: 1 }}>
            <Typography variant="body2">
              {sugerencias.sugerencia_ia.tipo === "complemento" ? "Complemento" : "Factura"}{" "}
              {sugerencias.sugerencia_ia.timbre_uuid_sugerido.slice(0, 8)}
            </Typography>
            {sugerencias.sugerencia_ia.razon && (
              <Typography variant="caption" color="text.secondary">{sugerencias.sugerencia_ia.razon}</Typography>
            )}
          </Box>
          <Button
            size="small"
            variant={timbreUuid === sugerencias.sugerencia_ia.timbre_uuid_sugerido ? "contained" : "outlined"}
            onClick={() => onUsar(sugerencias.sugerencia_ia!.timbre_uuid_sugerido, sugerencias.sugerencia_ia!.tipo === "complemento")}
          >
            {timbreUuid === sugerencias.sugerencia_ia.timbre_uuid_sugerido ? "Elegida" : "Usar"}
          </Button>
        </Stack>
      ) : itemsTab.length === 0 ? (
        <Typography variant="body2" color="text.secondary" sx={{ mt: 1 }}>Sin resultados con ese filtro de monto.</Typography>
      ) : (
        <>
        <TableContainer>
          <Table size="small">
            <TableHead>
              <TableRow>
                <TableCell>Tipo</TableCell>
                <TableCell>Folio</TableCell>
                <TableCell>Ingreso/Egreso</TableCell>
                <TableCell>Emisor</TableCell>
                <TableCell>RFC</TableCell>
                <TableCell>Fecha</TableCell>
                <TableCell align="right">Total</TableCell>
                <TableCell />
              </TableRow>
            </TableHead>
            <TableBody>
              {itemsPagina.map((s) => {
                const esComp = s._tipo === "complemento";
                const elegida = timbreUuid === s.timbre_uuid && esComplemento === esComp;
                const tipoLabel = esComp ? "—" : s.tipo_comprobante === "I" ? "Ingreso" : s.tipo_comprobante === "E" ? "Egreso" : s.tipo_comprobante || "—";
                return (
                  <TableRow
                    key={s.timbre_uuid + s._tipo}
                    selected={elegida}
                    hover
                    sx={{ cursor: "pointer" }}
                    onClick={() => onUsar(s.timbre_uuid, esComp)}
                  >
                    <TableCell sx={{ whiteSpace: "nowrap" }}>{esComp ? "Complemento" : "Factura"}</TableCell>
                    <TableCell sx={{ whiteSpace: "nowrap" }}>{s.folio || "—"}</TableCell>
                    <TableCell sx={{ whiteSpace: "nowrap" }}>{tipoLabel}</TableCell>
                    <TableCell sx={{ maxWidth: 180, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                      {s.emisor_nombre || "—"}
                    </TableCell>
                    <TableCell sx={{ fontFamily: "monospace", fontSize: "0.7rem", whiteSpace: "nowrap" }}>{s.emisor_rfc || "—"}</TableCell>
                    <TableCell sx={{ whiteSpace: "nowrap" }}>{s.fecha_timbrado || "—"}</TableCell>
                    <TableCell align="right" sx={{ whiteSpace: "nowrap" }}>{numero(s.total)}</TableCell>
                    <TableCell align="right" sx={{ whiteSpace: "nowrap" }}>
                      <Button size="small" variant={elegida ? "contained" : "outlined"} onClick={(e) => { e.stopPropagation(); onUsar(s.timbre_uuid, esComp); }}>
                        {elegida ? "Elegida" : "Usar"}
                      </Button>
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </TableContainer>
        <TablePagination
          component="div"
          count={itemsTab.length}
          page={page}
          onPageChange={(_, p) => setPage(p)}
          rowsPerPage={ROWS_PER_PAGE}
          rowsPerPageOptions={[ROWS_PER_PAGE]}
          labelDisplayedRows={({ from, to, count }) => `${from}–${to} de ${count}`}
        />
        </>
      )}
    </>
  );
});
type TabDetalle = "detalles" | "vincular" | "recordatorio";


export default function ConciliacionFacturasPage() {
  const [session, setSession] = useState<SessionUser | null>(null);
  const [tab, setTab] = useState<TabPrincipal>("ligado");
  const [datos, setDatos] = useState<ConciliacionCfdiResponse>(VACIO);
  const [sociedades, setSociedades] = useState<GeneralSociedad[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState("");

  // Rango de fechas (10/Sep/2026, "no es por periodo debe ser por rango de
  // fecha o una sola fecha") - desde/hasta iguales = una sola fecha.
  // Default: mes corriente completo.
  const [desde, setDesde] = useState(primerDiaDelMes());
  const [hasta, setHasta] = useState(ultimoDiaDelMes());
  const [filtroEmpresa, setFiltroEmpresa] = useState("");
  const [filtroContrato, setFiltroContrato] = useState("");
  // ContratoSelector requiere el objeto completo (23/Sep/2026, busca en
  // vivo en vez de una lista fija de 200 - hay 900+ contratos reales,
  // ver comentario del componente); filtroContrato sigue siendo el id
  // plano que ya usa el resto de la pantalla.
  const [contratoSeleccionado, setContratoSeleccionado] = useState<TesoreriaContrato | null>(null);
  const [filtroTipoComprobante, setFiltroTipoComprobante] = useState<"" | "I" | "E">("");

  // Paginacion server-side 
  // patron que Flujos (page-based, no cursor).
  const [pagina, setPagina] = useState(0);
  const [filasPorPagina, setFilasPorPagina] = useState(50);

  // Exportar a Google Sheets (14/Sep/2026, reemplaza "Exportar CSV") - ver
  // hook reusable en lib/useExportarSheets.ts.
  const {
    exportando,
    error: errorExportarSheets,
    exportar: handleExportarSheets,
  } = useExportarSheets((carpetaId) =>
    exportarConciliacionCfdiSheets(
      {
        desde: desde || undefined,
        hasta: hasta || undefined,
        sociedad: filtroEmpresa || undefined,
        contrato: filtroContrato || undefined,
        tipoComprobante: filtroTipoComprobante || undefined,
      },
      carpetaId
    )
  );
  const [descargandoCsv, setDescargandoCsv] = useState(false);
  const handleDescargarCsv = async () => {
    setDescargandoCsv(true);
    try {
      await descargarConciliacionCfdiCsv({ desde: desde || undefined, hasta: hasta || undefined, sociedad: filtroEmpresa || undefined, contrato: filtroContrato || undefined, tipoComprobante: filtroTipoComprobante || undefined });
    } finally {
      setDescargandoCsv(false);
    }
  };

  // Dialogo de detalle (un pago) con sus propios tabs internos.
  const [detalle, setDetalle] = useState<ConciliacionCfdiFila | null>(null);
  const [detalleTab, setDetalleTab] = useState<TabDetalle>("detalles");
  const [detalleEsNoRequiere, setDetalleEsNoRequiere] = useState(false);

  const [timbreUuid, setTimbreUuid] = useState("");
  const [esComplemento, setEsComplemento] = useState(false);
  const handleUsarSugerencia = useCallback((uuid: string, esComp: boolean) => {
    setTimbreUuid(uuid);
    setEsComplemento(esComp);
  }, []);
  const [vinculando, setVinculando] = useState(false);
  const [errorVincular, setErrorVincular] = useState<string | null>(null);
  const [sugerencias, setSugerencias] = useState<SugerenciasCfdiResponse | null>(null);
  const [cargandoSugerencias, setCargandoSugerencias] = useState(false);
  const [filtroBusquedaMonto, setFiltroBusquedaMonto] = useState("");

  const [mensajeRecordatorio, setMensajeRecordatorio] = useState("");
  const [enviandoRecordatorio, setEnviandoRecordatorio] = useState(false);
  const [recordatorioEnviado, setRecordatorioEnviado] = useState(false);
  const [errorRecordatorio, setErrorRecordatorio] = useState<string | null>(null);

  const [previewDoc, setPreviewDoc] = useState<{ url: string; titulo: string } | null>(null);

  // Referencias cruzadas 
  // extraido a PanelReferenciaCruzada, reusado tal cual.
  const [panelReferencia, setPanelReferencia] = useState<ReferenciaCruzada>(null);

  // Aprobacion en lote 
  // el humano sigue decidiendo (puede desmarcar filas), solo deja de abrir
  // cada pago para aprobarlo de uno en uno.
  const [loteAbierto, setLoteAbierto] = useState(false);
  const [loteSugerencias, setLoteSugerencias] = useState<SugerenciaCfdiLote[]>([]);
  const [loteSeleccion, setLoteSeleccion] = useState<Set<string>>(new Set());
  const [cargandoLote, setCargandoLote] = useState(false);
  const [aprobandoLote, setAprobandoLote] = useState(false);
  const [errorLote, setErrorLote] = useState<string | null>(null);

  function abrirLote() {
    setLoteAbierto(true);
    setErrorLote(null);
    setCargandoLote(true);
    getSugerenciasCfdiLote({
      desde: desde || undefined,
      hasta: hasta || undefined,
      sociedad: filtroEmpresa || undefined,
      contrato: filtroContrato || undefined,
    })
      .then((data) => {
        setLoteSugerencias(data);
        // Preseleccionadas las de confianza "alta" - las de "media" el
        // analista las revisa antes de marcarlas.
        // Solo preseleccionar alta confianza; IA y media el analista las revisa
        setLoteSeleccion(new Set(data.filter((s) => s.confianza === "alta").map((s) => s.id_flujo)));
      })
      .catch((err) => setErrorLote(err instanceof Error ? err.message : "Error al buscar sugerencias"))
      .finally(() => setCargandoLote(false));
  }

  function toggleLoteSeleccion(idFlujo: string) {
    setLoteSeleccion((prev) => {
      const next = new Set(prev);
      if (next.has(idFlujo)) next.delete(idFlujo);
      else next.add(idFlujo);
      return next;
    });
  }

  async function handleAprobarLote() {
    setAprobandoLote(true);
    setErrorLote(null);
    try {
      const items = loteSugerencias
        .filter((s) => loteSeleccion.has(s.id_flujo))
        .map((s) => ({ id_flujo: s.id_flujo, tipo: s.tipo, timbre_uuid: s.timbre_uuid }));
      const resultados = await aprobarLoteCfdi(items);
      const fallidos = resultados.filter((r) => !r.ok);
      if (fallidos.length > 0) {
        setErrorLote(`${fallidos.length} no se pudieron ligar (ej. ${fallidos[0].id_flujo}: ${fallidos[0].detalle}).`);
      } else {
        setLoteAbierto(false);
      }
      refresh();
    } catch (err) {
      setErrorLote(err instanceof Error ? err.message : "Error al aprobar el lote");
    } finally {
      setAprobandoLote(false);
    }
  }

  const puedeEditar = session?.perm_keys.includes("tesoreria.editar") ?? false;

  function refresh() {
    setLoading(true);
    setError(null);
    getConciliacionCfdi({
      desde: desde || undefined,
      hasta: hasta || undefined,
      sociedad: filtroEmpresa || undefined,
      contrato: filtroContrato || undefined,
      tipoComprobante: filtroTipoComprobante || undefined,
      search: search || undefined,
      tab: TAB_A_BUCKET[tab],
      page: pagina + 1,
      pageSize: filasPorPagina,
    })
      // Los otros 2 buckets solo traen su `count` (para los badges de las
      // pestañas) - sus `results` van vacios y nunca se renderizan, solo
      // se muestra `results` del bucket de la pestaña activa.
      .then(setDatos)
      .catch((err) => setError(err instanceof Error ? err.message : "Error al cargar la conciliación"))
      .finally(() => setLoading(false));
  }

  useEffect(() => {
    getSession().then(setSession);
    listSociedades().then(setSociedades).catch(() => setSociedades([]));
  }, []);

  // Cambiar de pestaña es otro bucket (con su propia paginacion) - vuelve
  // a la primera pagina, igual que cambiar cualquier otro filtro.
  useEffect(() => {
    setPagina(0);
  }, [tab]);

  useEffect(() => {
    const timeout = setTimeout(refresh, 300);
    return () => clearTimeout(timeout);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [search, tab, pagina, filasPorPagina]);

  function abrirDetalle(fila: ConciliacionCfdiFila, origenTab: TabPrincipal) {
    setDetalle(fila);
    const esNoRequiere = origenTab === "no_requiere";
    setDetalleEsNoRequiere(esNoRequiere);
    // Pestaña inicial segun lo que mas tiene sentido para esa fila: si ya
    // tiene CFDI (o no requiere) se abre en Referencias/Detalles, si no en
    // Vincular (accion pendiente).
    setDetalleTab(esNoRequiere || fila.factura || fila.complemento ? "detalles" : "vincular");
    setTimbreUuid("");
    setEsComplemento(false);
    setErrorVincular(null);
    setMensajeRecordatorio("");
    setRecordatorioEnviado(false);
    setErrorRecordatorio(null);
    setSugerencias(null);
    setFiltroBusquedaMonto("");
  }

  // Buscar sugerencias (10/Sep/2026, "la vinculacion no tiene un boton para
  // las sugerencias") - accion explicita del analista, ya no se dispara
  // sola al abrir el dialogo.
  function buscarSugerencias(idFlujo: string) {
    setCargandoSugerencias(true);
    getSugerenciasCfdi(idFlujo)
      .then(setSugerencias)
      .catch(() => setSugerencias(null))
      .finally(() => setCargandoSugerencias(false));
  }

  async function handleVincular() {
    if (!detalle || !timbreUuid) return;
    setVinculando(true);
    setErrorVincular(null);
    try {
      await vincularFactura(detalle.id_flujo, esComplemento ? { complemento: timbreUuid } : { factura: timbreUuid });
      setDetalle(null);
      refresh();
    } catch (err) {
      setErrorVincular(err instanceof Error ? err.message : "Error al vincular");
    } finally {
      setVinculando(false);
    }
  }

  async function handleRecordatorio() {
    if (!detalle) return;
    setEnviandoRecordatorio(true);
    setErrorRecordatorio(null);
    try {
      await enviarRecordatorioFlujo(detalle.id_flujo, mensajeRecordatorio || undefined);
      setRecordatorioEnviado(true);
    } catch (err) {
      setErrorRecordatorio(err instanceof Error ? err.message : "Error al enviar el recordatorio");
    } finally {
      setEnviandoRecordatorio(false);
    }
  }

  // search ya se aplica del lado del servidor (SearchFilter sobre
  // id_flujo/concepto, ver backend) - las 3 pestañas solo traen su
  // `count`, el bucket activo trae `results` ya paginados.
  const filasVisibles = datos[TAB_A_BUCKET[tab]].results;
  const colSpan = tab === "ligado" ? 9 : 7;

  return (
    <AppShell>
      <Box sx={{ p: 3 }}>
        <Typography variant="h5" sx={{ mb: 0.5 }}>
          Conciliación de Facturas
        </Typography>
        <Typography variant="body2" color="text.secondary" sx={{ mb: 3 }}>
          Clasificación de pagos según su CFDI. Filtro base: mes corriente.
        </Typography>

        {error && (
          <Alert severity="error" sx={{ mb: 3 }}>
            {error}
          </Alert>
        )}
        {errorExportarSheets && <Alert severity="error" sx={{ mb: 3 }}>{errorExportarSheets}</Alert>}

        <FiltrosBar
          search={search}
          onSearchChange={setSearch}
          searchPlaceholder="Buscar por ID de flujo o concepto..."
          onAplicarFiltros={() => {
            setPagina(0);
            refresh();
          }}
          onLimpiarFiltros={() => {
            setDesde(primerDiaDelMes());
            setHasta(ultimoDiaDelMes());
            setFiltroEmpresa("");
            setFiltroContrato("");
            setContratoSeleccionado(null);
            setFiltroTipoComprobante("");
            setPagina(0);
          }}
          actions={
            <>
              <Button
                size="small"
                variant="outlined"
                startIcon={exportando ? <CircularProgress size={14} /> : <FileSpreadsheet size={14} strokeWidth={2} />}
                disabled={exportando}
                onClick={handleExportarSheets}
                sx={{ flexShrink: 0 }}
              >
                Exportar a Google Sheets
              </Button>
              <Button
                size="small"
                variant="outlined"
                startIcon={descargandoCsv ? <CircularProgress size={14} /> : <FileSpreadsheet size={14} strokeWidth={2} />}
                disabled={descargandoCsv}
                onClick={handleDescargarCsv}
                sx={{ flexShrink: 0 }}
              >
                Descargar CSV
              </Button>
            </>
          }
        >
          <TextField
            size="small"
            type="date"
            label="Desde"
            value={desde}
            onChange={(e) => setDesde(e.target.value)}
            InputLabelProps={{ shrink: true }}
          />
          <TextField
            size="small"
            type="date"
            label="Hasta"
            value={hasta}
            onChange={(e) => setHasta(e.target.value)}
            InputLabelProps={{ shrink: true }}
          />
          <FormControl size="small">
            <InputLabel id="filtro-empresa-label">Empresa</InputLabel>
            <Select
              labelId="filtro-empresa-label"
              label="Empresa"
              value={filtroEmpresa}
              onChange={(e) => {
                setFiltroEmpresa(e.target.value);
                setFiltroContrato("");
                setContratoSeleccionado(null);
              }}
            >
              <MenuItem value="">
                <em>Todas las empresas</em>
              </MenuItem>
              {sociedades.map((s) => (
                <MenuItem key={s.rfc} value={s.rfc}>
                  {s.alias_sociedad || s.razon_social || s.rfc}
                </MenuItem>
              ))}
            </Select>
          </FormControl>
          <ContratoSelector
            label="Contrato"
            sociedad={filtroEmpresa || undefined}
            value={contratoSeleccionado}
            onChange={(seleccion) => {
              setContratoSeleccionado(seleccion);
              setFiltroContrato(seleccion?.id_contrato || "");
            }}
          />
          <FormControl size="small">
            <InputLabel id="filtro-tipo-label">Ingreso/Egreso</InputLabel>
            <Select
              labelId="filtro-tipo-label"
              label="Ingreso/Egreso"
              value={filtroTipoComprobante}
              onChange={(e) => setFiltroTipoComprobante(e.target.value as "" | "I" | "E")}
            >
              <MenuItem value="">
                <em>Ambos</em>
              </MenuItem>
              <MenuItem value="I">Ingreso</MenuItem>
              <MenuItem value="E">Egreso</MenuItem>
            </Select>
          </FormControl>
        </FiltrosBar>

        {/* Tabs pegados a la tabla, un solo Paper - mismo patron que PLD
        (ver memoria feedback-patron-tabs-pegados-a-tabla). */}
        <Paper variant="outlined">
          <Stack
            direction="row"
            alignItems="center"
            justifyContent="space-between"
            sx={{ borderBottom: "1px solid", borderColor: "divider", pr: 2 }}
          >
            <Tabs value={tab} onChange={(_, v) => setTab(v)} sx={{ px: 2 }}>
              <Tab value="ligado" label={`Ligado a CFDI (${datos.con_cfdi.count})`} />
              <Tab value="sin_cfdi" label={`Sin CFDI (${datos.sin_cfdi.count})`} />
              <Tab value="no_requiere" label={`No requiere CFDI (${datos.no_requiere.count})`} />
            </Tabs>
            {tab === "sin_cfdi" && puedeEditar && (
              <Button size="small" variant="outlined" onClick={abrirLote}>
                Sugerencias en lote
              </Button>
            )}
          </Stack>

          <TableContainer>
            <Table size="small">
              <TableHead>
                <TableRow>
                  <TableCell>ID Flujo</TableCell>
                  <TableCell>Contrato</TableCell>
                  <TableCell>Proveedor</TableCell>
                  <TableCell>Concepto</TableCell>
                  <TableCell>Fecha efectiva</TableCell>
                  <TableCell align="right">Total del pago</TableCell>
                  {tab === "ligado" && (
                    <>
                      <TableCell align="right">Reconocido</TableCell>
                      <TableCell align="right">Por reconocer</TableCell>
                    </>
                  )}
                  <TableCell align="right">Detalle</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {loading ? (
                  <TableRow>
                    <TableCell colSpan={colSpan} align="center" sx={{ py: 3 }}>
                      <CircularProgress size={20} />
                    </TableCell>
                  </TableRow>
                ) : filasVisibles.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={colSpan} align="center" sx={{ py: 3 }}>
                      <Typography variant="body2" color="text.secondary">
                        Sin pagos en este periodo.
                      </Typography>
                    </TableCell>
                  </TableRow>
                ) : (
                  filasVisibles.map((f) => {
                    const cuadra = f.por_reconocer != null && Number(f.por_reconocer) === 0;
                    return (
                      <TableRow key={f.id_flujo} hover>
                        <TableCell sx={{ fontFamily: "var(--font-mono, monospace)" }}>{f.id_flujo}</TableCell>
                        <TableCell>{f.contrato || "—"}</TableCell>
                        <TableCell>{f.contraparte_nombre || "—"}</TableCell>
                        <TableCell>{f.concepto || "—"}</TableCell>
                        <TableCell>{f.fecha_efectiva || "—"}</TableCell>
                        <TableCell align="right">{numero(f.total_mxp)}</TableCell>
                        {tab === "ligado" && (
                          <>
                            <TableCell align="right">{numero(f.reconocido)}</TableCell>
                            <TableCell align="right">
                              <Typography
                                component="span"
                                variant="body2"
                                color={f.por_reconocer == null ? "text.secondary" : cuadra ? "success.main" : "error.main"}
                              >
                                {numero(f.por_reconocer)}
                              </Typography>
                            </TableCell>
                          </>
                        )}
                        <TableCell align="right">
                          <IconButton size="small" aria-label="Ver" title="Ver" onClick={() => abrirDetalle(f, tab)}>
                            <Eye size={16} strokeWidth={1.5} />
                          </IconButton>
                        </TableCell>
                      </TableRow>
                    );
                  })
                )}
              </TableBody>
            </Table>
          </TableContainer>
          <TablePagination
            component="div"
            count={datos[TAB_A_BUCKET[tab]].count}
            page={pagina}
            onPageChange={(_, nuevaPagina) => setPagina(nuevaPagina)}
            rowsPerPage={filasPorPagina}
            onRowsPerPageChange={(e) => {
              setFilasPorPagina(parseInt(e.target.value, 10));
              setPagina(0);
            }}
            rowsPerPageOptions={[20, 50, 100]}
            labelRowsPerPage="Filas por página"
            labelDisplayedRows={({ from, to, count }) => `${from}–${to} de ${count}`}
          />
        </Paper>

        {/* Detalle del pago - un solo dialogo con tabs propios (10/Sep/2026,
        "deben estar dentro de una pantalla emergente con su propio tabs").
        Vincular, Recordatorio y Referencias viven aqui, ya no como botones
        sueltos en la tabla. */}
        <Dialog
          open={!!detalle}
          onClose={(_, reason) => {
            // Solo se cierra con el boton X (10/Sep/2026, "sin hacer click
            // fuera") - ignora backdropClick/escapeKeyDown.
            if (reason === "backdropClick" || reason === "escapeKeyDown") return;
            setDetalle(null);
          }}
          fullWidth
          maxWidth={false}
          PaperProps={{ sx: { maxHeight: "88vh", width: "98vw" } }}
        >
          <DialogTitle sx={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
            Pago {detalle?.id_flujo}
            <IconButton onClick={() => setDetalle(null)} size="small" aria-label="Cerrar">
              <CloseIcon size={18} strokeWidth={1.5} />
            </IconButton>
          </DialogTitle>
          <Tabs value={detalleTab} onChange={(_, v) => setDetalleTab(v)} sx={{ borderBottom: "1px solid", borderColor: "divider", px: 2 }}>
            <Tab value="detalles" label="Detalles" />
            {!detalleEsNoRequiere && <Tab value="vincular" label="Vincular CFDI" />}
            {/* Recordatorio solo tiene sentido mientras falta el CFDI - una
            vez vinculado se quita (23/Sep/2026, "si ya esta vinculada... el
            recordatorio se quita"). */}
            {!detalleEsNoRequiere && !detalle?.factura && !detalle?.complemento && (
              <Tab value="recordatorio" label="Recordatorio" />
            )}
          </Tabs>
          <DialogContent dividers sx={{ py: 1.5 }}>
            {detalle && detalleTab === "detalles" && (
              <Stack spacing={2}>
                <TableContainer component={Paper} variant="outlined">
                  <Table size="small">
                    <TableBody>
                      <TableRow>
                        <TableCell sx={{ bgcolor: "action.hover", fontWeight: "bold", width: "30%" }}>Concepto:</TableCell>
                        <TableCell colSpan={3}>{detalle.concepto || "—"}</TableCell>
                      </TableRow>
                      <TableRow>
                        <TableCell sx={{ bgcolor: "action.hover", fontWeight: "bold" }}>Fecha efectiva:</TableCell>
                        <TableCell>{detalle.fecha_efectiva || "—"}</TableCell>
                        {detalle.factura || detalle.complemento ? (
                          <>
                            <TableCell sx={{ bgcolor: "action.hover", fontWeight: "bold" }}>Reconocido:</TableCell>
                            <TableCell>{numero(detalle.reconocido)}</TableCell>
                          </>
                        ) : (
                          <TableCell colSpan={2} />
                        )}
                      </TableRow>
                      <TableRow>
                        <TableCell sx={{ bgcolor: "action.hover", fontWeight: "bold" }}>Total del pago:</TableCell>
                        <TableCell sx={{ color: Number(detalle.total_mxp) < 0 ? "error.main" : undefined }}>
                          {numero(detalle.total_mxp)}
                        </TableCell>
                        {detalle.factura || detalle.complemento ? (
                          <>
                            <TableCell sx={{ bgcolor: "action.hover", fontWeight: "bold" }}>Por reconocer:</TableCell>
                            <TableCell>{numero(detalle.por_reconocer)}</TableCell>
                          </>
                        ) : (
                          <TableCell colSpan={2} />
                        )}
                      </TableRow>
                      <TableRow>
                        <TableCell sx={{ bgcolor: "action.hover", fontWeight: "bold" }}>Necesita factura:</TableCell>
                        <TableCell colSpan={3}>
                          {detalle.requiere_factura ? "Sí" : detalle.requiere_factura === false ? "No" : "Sin definir"}
                        </TableCell>
                      </TableRow>
                    </TableBody>
                  </Table>
                </TableContainer>

                {!detalle.factura && !detalle.complemento && !detalle.nomina && (
                  <Typography variant="body2" color="text.secondary">
                    Este pago todavía no tiene ningún CFDI ligado.
                  </Typography>
                )}

                <TableContainer component={Paper} variant="outlined">
                  <Table size="small">
                    <TableHead>
                      <TableRow>
                        <TableCell sx={{ bgcolor: "action.hover", fontWeight: "bold" }}>Concepto</TableCell>
                        <TableCell sx={{ bgcolor: "action.hover", fontWeight: "bold" }}>Detalles</TableCell>
                        <TableCell sx={{ bgcolor: "action.hover", fontWeight: "bold" }} align="right">Acciones</TableCell>
                      </TableRow>
                    </TableHead>
                    <TableBody>
                      {detalle.factura && (
                        <TableRow>
                          <TableCell sx={{ fontWeight: "bold" }}>Factura</TableCell>
                          <TableCell>Folio: {detalle.factura_folio || `#${detalle.factura}`}</TableCell>
                          <TableCell align="right">
                            <Button size="small" startIcon={<Eye size={14} strokeWidth={1.5} />}
                              onClick={() => setPreviewDoc({ url: urlVerFacturaPdf(detalle.factura as number), titulo: `Factura ${detalle.factura_folio || detalle.factura}` })}
                              sx={{ ml: 1 }}>
                              Ver PDF
                            </Button>
                          </TableCell>
                        </TableRow>
                      )}
                      {detalle.factura && (
                        <TableRow>
                          <TableCell sx={{ fontWeight: "bold" }}>Importe Factura</TableCell>
                          <TableCell>
                            Importe: {numero(detalle.factura_subtotal)} | IVA: {numero(detalle.factura_iva)} | Total:{" "}
                            {numero(detalle.factura_total)}
                          </TableCell>
                          <TableCell />
                        </TableRow>
                      )}
                      {detalle.complemento && (
                        <TableRow>
                          <TableCell sx={{ fontWeight: "bold" }}>Complemento de pago (REP)</TableCell>
                          <TableCell>REP #: {detalle.complemento_folio || `#${detalle.complemento}`}</TableCell>
                          <TableCell />
                        </TableRow>
                      )}
                      {detalle.nomina && (
                        <TableRow>
                          <TableCell sx={{ fontWeight: "bold" }}>Recibo de nómina</TableCell>
                          <TableCell>#{detalle.nomina}</TableCell>
                          <TableCell />
                        </TableRow>
                      )}
                      <TableRow>
                        <TableCell sx={{ fontWeight: "bold" }}>Contrato</TableCell>
                        <TableCell>ID: {detalle.contrato || "—"}</TableCell>
                        <TableCell align="right">
                          {detalle.contrato && (
                            <Button size="small" startIcon={<ExternalLink size={14} strokeWidth={1.5} />}
                              onClick={() => setPanelReferencia({ tipo: "contrato", id: detalle.contrato as string })}
                              sx={{ ml: 1 }}>
                              Ver contrato
                            </Button>
                          )}
                        </TableCell>
                      </TableRow>
                      <TableRow>
                        <TableCell sx={{ fontWeight: "bold" }}>Proveedor</TableCell>
                        <TableCell>Nombre: {detalle.contraparte_nombre || "—"}</TableCell>
                        <TableCell align="right">
                          {detalle.contraparte && (
                            <Button size="small" startIcon={<ExternalLink size={14} strokeWidth={1.5} />}
                              onClick={() => setPanelReferencia({ tipo: "proveedor", id: detalle.contraparte as string })}
                              sx={{ ml: 1 }}>
                              Ver proveedor
                            </Button>
                          )}
                        </TableCell>
                      </TableRow>
                    </TableBody>
                  </Table>
                </TableContainer>
              </Stack>
            )}

            {detalle && detalleTab === "vincular" && (
              <>
                {errorVincular && (
                  <Alert severity="error" sx={{ mb: 2 }}>
                    {errorVincular}
                  </Alert>
                )}
                {detalle.factura || detalle.complemento ? (
                  <Stack spacing={1.5}>
                    <Alert severity="success">
                      Este pago ya está ligado a {detalle.factura ? `la factura ${detalle.factura_folio || `#${detalle.factura}`}` : ""}
                      {detalle.factura && detalle.complemento ? " y " : ""}
                      {detalle.complemento ? `al complemento ${detalle.complemento_folio || `#${detalle.complemento}`}` : ""}.
                    </Alert>
                    {detalle.factura && (
                      <Button
                        size="small"
                        startIcon={<Eye size={14} strokeWidth={1.5} />}
                        onClick={() =>
                          setPreviewDoc({
                            url: urlVerFacturaPdf(detalle.factura as number),
                            titulo: `Factura ${detalle.factura_folio || detalle.factura}`,
                          })
                        }
                        sx={{ alignSelf: "flex-end", mt: 1 }}
                      >
                        Ver factura
                      </Button>
                    )}
                    {detalle.complemento && (
                      <Button
                        size="small"
                        startIcon={<Eye size={14} strokeWidth={1.5} />}
                        onClick={() =>
                          setPreviewDoc({
                            url: urlVerComplementoPagoPdf(detalle.complemento as number),
                            titulo: `Complemento ${detalle.complemento_folio || detalle.complemento}`,
                          })
                        }
                        sx={{ alignSelf: "flex-end", mt: 1 }}
                      >
                        Ver complemento
                      </Button>
                    )}
                  </Stack>
                ) : (
                  <>
                    <Stack direction="row" spacing={1} alignItems="flex-start" sx={{ mb: 1.5 }} flexWrap="wrap">
                      <TextField
                        size="small"
                        label="Filtrar por monto"
                        value={filtroBusquedaMonto}
                        onChange={(e) => setFiltroBusquedaMonto(e.target.value)}
                        placeholder="ej. 12500"
                        sx={{ width: 160 }}
                      />
                      <TextField
                        size="small"
                        label="UUID del comprobante"
                        value={timbreUuid}
                        onChange={(e) => setTimbreUuid(e.target.value)}
                        placeholder="00000000-0000-0000-0000-000000000000"
                        sx={{ flex: 1, minWidth: 260 }}
                      />
                      <Button
                        size="small"
                        variant="outlined"
                        disabled={cargandoSugerencias}
                        onClick={() => buscarSugerencias(detalle.id_flujo)}
                        sx={{ alignSelf: "center" }}
                      >
                        {cargandoSugerencias ? <CircularProgress size={14} /> : "Buscar sugerencias"}
                      </Button>
                    </Stack>
                    {sugerencias === null && !cargandoSugerencias ? (
                      <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
                        Presiona "Buscar sugerencias" para ver candidatos (mismo proveedor, RFC o nombre similar).
                      </Typography>
                    ) : cargandoSugerencias ? null : sugerencias && (sugerencias.facturas.length > 0 || sugerencias.complementos.length > 0 || sugerencias.sugerencia_ia) ? (
                      <Box sx={{ mb: 2 }}>
                        <SugerenciasTabs
                          sugerencias={sugerencias}
                          filtroBusquedaMonto={filtroBusquedaMonto}
                          timbreUuid={timbreUuid}
                          esComplemento={esComplemento}
                          onUsar={handleUsarSugerencia}
                          numero={numero}
                        />
                      </Box>
                    ) : (
                      <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
                        Sin coincidencias por proveedor, RFC ni nombre — captúralo a mano abajo.
                      </Typography>
                    )}

                  </>
                )}
              </>
            )}

            {detalle && detalleTab === "recordatorio" && (
              <>
                {errorRecordatorio && (
                  <Alert severity="error" sx={{ mb: 2 }}>
                    {errorRecordatorio}
                  </Alert>
                )}
                {recordatorioEnviado ? (
                  <Alert severity="success">Recordatorio enviado.</Alert>
                ) : (
                  <>
                    <Typography variant="body2" color="text.secondary" sx={{ mb: 1.5 }}>
                      Se le avisa a {detalle.contraparte_nombre || "el proveedor"} que todavía falta su factura. Agrega un
                      mensaje si quieres personalizarlo (opcional).
                    </Typography>
                    <TextField
                      size="small"
                      fullWidth
                      multiline
                      minRows={3}
                      label="Mensaje (opcional)"
                      value={mensajeRecordatorio}
                      onChange={(e) => setMensajeRecordatorio(e.target.value)}
                      placeholder="Ej. Nos falta también el complemento de pago, no solo la factura."
                    />
                  </>
                )}
              </>
            )}

          </DialogContent>
          <DialogActions>
            <Button onClick={() => setDetalle(null)}>Cerrar</Button>
            {detalleTab === "vincular" && puedeEditar && !(detalle?.factura || detalle?.complemento) && (
              <Button variant="contained" disabled={!timbreUuid || vinculando} onClick={handleVincular}>
                {vinculando ? <CircularProgress size={16} /> : "Vincular"}
              </Button>
            )}
            {detalleTab === "recordatorio" && puedeEditar && !recordatorioEnviado && (
              <Button variant="contained" disabled={enviandoRecordatorio} onClick={handleRecordatorio}>
                {enviandoRecordatorio ? <CircularProgress size={16} /> : "Enviar recordatorio"}
              </Button>
            )}
          </DialogActions>
        </Dialog>

        {/* Aprobacion en lote (10/Sep/2026, "aprobar en lote, no uno por
        uno") - lista todas las sugerencias de "Sin CFDI" a la vez; el
        humano marca/desmarca (las de confianza alta ya vienen marcadas) y
        aprueba todas juntas con un solo boton. */}
        <Dialog
          open={loteAbierto}
          onClose={(_, reason) => {
            if (reason === "backdropClick" || reason === "escapeKeyDown") return;
            setLoteAbierto(false);
          }}
          fullWidth
          maxWidth="sm"
        >
          <DialogTitle sx={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
            Sugerencias en lote
            <IconButton onClick={() => setLoteAbierto(false)} size="small" aria-label="Cerrar">
              <CloseIcon size={18} strokeWidth={1.5} />
            </IconButton>
          </DialogTitle>
          <DialogContent dividers sx={{ py: 3 }}>
            {errorLote && (
              <Alert severity="error" sx={{ mb: 2 }}>
                {errorLote}
              </Alert>
            )}
            {cargandoLote ? (
              <Stack alignItems="center" sx={{ py: 3 }}>
                <CircularProgress size={20} />
              </Stack>
            ) : loteSugerencias.length === 0 ? (
              <Typography variant="body2" color="text.secondary">
                Sin candidatos por heurística ni por IA en este periodo.
              </Typography>
            ) : (
              <Stack spacing={1}>
                <Typography variant="body2" color="text.secondary" sx={{ mb: 1 }}>
                  Las de confianza alta (mismo monto exacto, único candidato) ya vienen marcadas. Las sugeridas por IA
                  no se marcan automáticamente — revísalas antes de aprobar.
                </Typography>
                {loteSugerencias.map((s) => (
                  <Stack
                    key={s.id_flujo}
                    direction="row"
                    spacing={1.5}
                    alignItems="center"
                    sx={{ border: 1, borderColor: "divider", borderRadius: 1, p: 1.5 }}
                  >
                    <Checkbox
                      size="small"
                      checked={loteSeleccion.has(s.id_flujo)}
                      onChange={() => toggleLoteSeleccion(s.id_flujo)}
                    />
                    <Box sx={{ flex: 1 }}>
                      <Typography variant="body2">
                        <strong>{s.id_flujo}</strong> — {s.contraparte_nombre || "—"} — {numero(s.total_mxp)}
                      </Typography>
                      <Typography variant="caption" color="text.secondary">
                        {s.concepto || "—"} → {s.tipo === "factura" ? "Factura" : "REP"} {s.folio || s.timbre_uuid.slice(0, 8)}
                      </Typography>
                      {s.confianza === "ia" && s.razon_ia && (
                        <Typography variant="caption" color="text.secondary" display="block">
                          IA: {s.razon_ia}
                        </Typography>
                      )}
                    </Box>
                    <Chip
                      size="small"
                      label={s.confianza === "alta" ? "Confianza alta" : s.confianza === "ia" ? "Sugerido por IA" : "Confianza media"}
                      color={s.confianza === "alta" ? "success" : s.confianza === "ia" ? "info" : "warning"}
                      variant="outlined"
                    />
                    <IconButton
                      size="small"
                      aria-label={s.tipo === "factura" ? "Ver factura" : "Ver complemento"}
                      title={s.tipo === "factura" ? "Ver factura" : "Ver complemento"}
                      onClick={() =>
                        setPreviewDoc({
                          url: s.tipo === "factura" ? urlVerFacturaPdf(s.id) : urlVerComplementoPagoPdf(s.id),
                          titulo: `${s.tipo === "factura" ? "Factura" : "Complemento"} ${s.folio || s.timbre_uuid.slice(0, 8)}`,
                        })
                      }
                    >
                      <Eye size={16} strokeWidth={1.5} />
                    </IconButton>
                  </Stack>
                ))}
              </Stack>
            )}
          </DialogContent>
          <DialogActions>
            <Button onClick={() => setLoteAbierto(false)}>Cancelar</Button>
            <Button
              variant="contained"
              disabled={loteSeleccion.size === 0 || aprobandoLote}
              onClick={handleAprobarLote}
            >
              {aprobandoLote ? <CircularProgress size={16} /> : `Aprobar seleccionadas (${loteSeleccion.size})`}
            </Button>
          </DialogActions>
        </Dialog>

        <DocumentoPreviewDialog
          open={!!previewDoc}
          onClose={() => setPreviewDoc(null)}
          url={previewDoc?.url ?? null}
          titulo={previewDoc?.titulo ?? ""}
        />

        <PanelReferenciaCruzada referencia={panelReferencia} onClose={() => setPanelReferencia(null)} />
      </Box>
    </AppShell>
  );
}
