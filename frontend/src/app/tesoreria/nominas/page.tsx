"use client";

import { useEffect, useMemo, useState } from "react";
import {
  Alert,
  Autocomplete,
  Button,
  Checkbox,
  Chip,
  CircularProgress,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  FormControl,
  FormControlLabel,
  FormHelperText,
  IconButton,
  InputLabel,
  ListItemIcon,
  ListItemText,
  Menu,
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
} from "@mui/material";
import { Eye, MoreVertical, Pencil, Plus, Users, X as CloseIcon, Zap } from "lucide-react";
import AppShell from "@/components/AppShell";
import FiltrosBar from "@/components/FiltrosBar";
import PanelReferenciaCruzada, { ReferenciaCruzada } from "@/components/PanelReferenciaCruzada";
import { SessionUser, getSession } from "@/lib/auth";
import { GeneralSociedad, listSociedades } from "@/lib/iam";
import { RrhhPuesto, listPuestos } from "@/lib/rrhh";
import { ViviendaProyecto, listProyectos } from "@/lib/vivienda";
import {
  TesoreriaCuenta,
  TesoreriaNomina,
  TesoreriaNominaStatus,
  TesoreriaNominaTipo,
  createFlujo,
  createNomina,
  getContratoGenericoNomina,
  listCuentas,
  listFlujos,
  listNominas,
  updateNomina,
} from "@/lib/tesoreria";

const TIPO_LABELS: Record<TesoreriaNominaTipo, string> = {
  QUINCENAL: "Quincenal (corporativo)",
  SEMANAL: "Semanal (obra)",
};

const FORM_VACIO = {
  tipo: "QUINCENAL" as TesoreriaNominaTipo,
  sociedad: "",
  proyecto: "",
  centro: "",
  serie: "",
  fechaInicio: "",
  fechaFin: "",
  status: "ACTIVO" as TesoreriaNominaStatus,
  comentarios: "",
};

const MESES = [
  "Enero", "Febrero", "Marzo", "Abril", "Mayo", "Junio",
  "Julio", "Agosto", "Septiembre", "Octubre", "Noviembre", "Diciembre",
];

function fechaISO(d: Date): string {
  return d.toISOString().slice(0, 10);
}

// Numero de semana ISO-8601 (11/Sep/2026, "Semanal va en semana 37" -
// pendiente real de negocio: Jenny/Dylan hablan en numero de semana del
// año, no solo en fechas). Algoritmo estandar: jueves de la semana define
// a que semana ISO pertenece.
function numeroSemanaISO(fecha: Date): number {
  const d = new Date(Date.UTC(fecha.getFullYear(), fecha.getMonth(), fecha.getDate()));
  const diaISO = d.getUTCDay() || 7; // domingo=0 -> 7
  d.setUTCDate(d.getUTCDate() + 4 - diaISO);
  const inicioAnio = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
  return Math.ceil(((d.getTime() - inicioAnio.getTime()) / 86400000 + 1) / 7);
}

// Numero de quincena del año (11/Sep/2026, "Quincenal va en periodo 17") -
// 2 quincenas por mes, secuencial: Enero 1ra=1, 2da=2, Febrero 1ra=3... asi
// Septiembre 1ra quincena = 17.
function numeroQuincenaAnio(mes: number, esPrimeraQuincena: boolean): number {
  return mes * 2 + (esPrimeraQuincena ? 1 : 2);
}

// Periodo quincenal (10/Sep/2026, "como va ser semanal o quincena debe
// poder en esos tiempos") - convencion estandar mexicana: 1-15 y 16-fin de
// mes. Se calcula sobre `hoy` para poder probar "cual es la quincena
// vigente" tanto al autocompletar el alta como al armar el aviso de
// "falta crear la nomina de este periodo".
function calcularPeriodoQuincenal(hoy: Date): { fechaInicio: string; fechaFin: string; serie: string } {
  const anio = hoy.getFullYear();
  const mes = hoy.getMonth(); // 0-indexado
  const esPrimeraQuincena = hoy.getDate() <= 15;
  const inicio = new Date(anio, mes, esPrimeraQuincena ? 1 : 16);
  const fin = esPrimeraQuincena ? new Date(anio, mes, 15) : new Date(anio, mes + 1, 0); // dia 0 del sig. mes = ultimo del actual
  const periodo = numeroQuincenaAnio(mes, esPrimeraQuincena);
  return {
    fechaInicio: fechaISO(inicio),
    fechaFin: fechaISO(fin),
    serie: `Periodo ${periodo} - Quincena ${esPrimeraQuincena ? 1 : 2} ${MESES[mes]} ${anio}`,
  };
}

// Periodo semanal (obra) - lunes a viernes de la semana de `hoy`, mismo
// criterio de cierre que Obra ("corte semanal es viernes", ver memoria
// "obra-vista-excel-y-envio-viernes").
function calcularPeriodoSemanal(hoy: Date): { fechaInicio: string; fechaFin: string; serie: string } {
  const diaSemana = hoy.getDay(); // 0=domingo, 1=lunes...
  const offsetLunes = diaSemana === 0 ? -6 : 1 - diaSemana;
  const lunes = new Date(hoy);
  lunes.setDate(hoy.getDate() + offsetLunes);
  const viernes = new Date(lunes);
  viernes.setDate(lunes.getDate() + 4);
  const semanaIso = numeroSemanaISO(lunes);
  return {
    fechaInicio: fechaISO(lunes),
    fechaFin: fechaISO(viernes),
    serie: `Semana ${semanaIso} - del ${lunes.getDate()} al ${viernes.getDate()} de ${MESES[viernes.getMonth()]} ${viernes.getFullYear()}`,
  };
}

function calcularPeriodoActual(tipo: TesoreriaNominaTipo, hoy = new Date()) {
  return tipo === "QUINCENAL" ? calcularPeriodoQuincenal(hoy) : calcularPeriodoSemanal(hoy);
}

// Nominas (10/Sep/2026, modulo de Nominas Fase 1) - periodo/agrupador que
// se desglosa en Flujos (uno por empleado pagado, via
// TesoreriaFlujo.periodo_nomina). Fase 1: captura manual, sin generacion
// automatica de lineas por empleado (rrhh-service todavia sin API/Puestos
// expuestos) - ver memoria de sesion "tesoreria-nominas-diseno-09sep".
export default function TesoreriaNominasPage() {
  const [session, setSession] = useState<SessionUser | null>(null);
  const [nominas, setNominas] = useState<TesoreriaNomina[]>([]);
  const [sociedades, setSociedades] = useState<GeneralSociedad[]>([]);
  // Proyecto real (10/Sep/2026, "el proyecto de nominas...son los mismos"
  // que Vivienda/Obra) - se liga al catalogo real de vivienda-service, no a
  // texto libre (a diferencia de Contratos/Obra, que siguen sueltos - ver
  // TesoreriaNomina.proyecto en models.py).
  const [proyectos, setProyectos] = useState<ViviendaProyecto[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [filtroSociedad, setFiltroSociedad] = useState("");
  const [filtroProyecto, setFiltroProyecto] = useState("");
  const [filtroCentro, setFiltroCentro] = useState("");
  const [filtroTipo, setFiltroTipo] = useState<TesoreriaNominaTipo | "">("");
  // Filtro por Serie (11/Sep/2026, "filtro de nominas por concepto=serie" -
  // pendiente real de negocio) - filtro exacto dedicado, distinto de la
  // busqueda de texto libre de arriba (esa hace substring sobre id+serie).
  // Serie es tambien el concepto que hereda cada Flujo hijo.
  const [filtroSerie, setFiltroSerie] = useState("");
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<TesoreriaNomina | null>(null);
  const [soloLectura, setSoloLectura] = useState(false);
  const [form, setForm] = useState(FORM_VACIO);
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [menuAnchor, setMenuAnchor] = useState<null | HTMLElement>(null);
  const [menuNomina, setMenuNomina] = useState<TesoreriaNomina | null>(null);
  // Referencias cruzadas (10/Sep/2026, "Ver Flujos debe seguir el patron de
  // referencias cruzadas") - mismo Drawer que Facturas/Flujos, en vez de
  // navegar a /tesoreria/flujos.
  const [panelReferencia, setPanelReferencia] = useState<ReferenciaCruzada>(null);
  // Generacion automatica de lineas por empleado activo (11/Sep/2026,
  // pendiente real de negocio, desbloqueado ahora que rrhh-service expone
  // GET /api/puestos/?sociedad=&proyecto=&vigente=true) - un Flujo por cada
  // Puesto vigente de la sociedad/proyecto de la Nomina, con un monto
  // ESTIMADO (salario_diario x dias del periodo, sin ISR/IMSS ni otras
  // deducciones reales de nomina) que Tesoreria debe revisar/ajustar en
  // cada Flujo antes de pagar - no reemplaza el calculo real de nomina.
  const [cuentas, setCuentas] = useState<TesoreriaCuenta[]>([]);
  const [generandoPara, setGenerandoPara] = useState<TesoreriaNomina | null>(null);
  const [puestosVigentes, setPuestosVigentes] = useState<RrhhPuesto[]>([]);
  const [empleadosConFlujo, setEmpleadosConFlujo] = useState<Set<string>>(new Set());
  const [cargandoPuestos, setCargandoPuestos] = useState(false);
  const [seleccionPuestos, setSeleccionPuestos] = useState<Set<string>>(new Set());
  const [cuentaGeneracion, setCuentaGeneracion] = useState("");
  const [generando, setGenerando] = useState(false);
  const [errorGeneracion, setErrorGeneracion] = useState<string | null>(null);
  const [resultadoGeneracion, setResultadoGeneracion] = useState<string | null>(null);

  useEffect(() => {
    getSession().then(setSession);
    listSociedades().then(setSociedades).catch(() => setSociedades([]));
    listProyectos().then(setProyectos).catch(() => setProyectos([]));
    listCuentas().then(setCuentas).catch(() => setCuentas([]));
  }, []);

  function diasDelPeriodo(n: TesoreriaNomina): number {
    if (!n.fecha_inicio || !n.fecha_fin) return 0;
    const ms = new Date(n.fecha_fin).getTime() - new Date(n.fecha_inicio).getTime();
    return Math.round(ms / 86400000) + 1;
  }

  function abrirGenerarLineas(n: TesoreriaNomina) {
    setGenerandoPara(n);
    setErrorGeneracion(null);
    setResultadoGeneracion(null);
    setCuentaGeneracion("");
    setCargandoPuestos(true);
    Promise.all([
      listPuestos({ sociedad: n.sociedad, proyecto: n.proyecto || undefined, vigente: true }),
      listFlujos({ nomina: n.id_nomina }),
    ])
      .then(([puestos, flujos]) => {
        setPuestosVigentes(puestos);
        const yaTienenFlujo = new Set(flujos.map((f) => f.id_empleado).filter((id): id is string => !!id));
        setEmpleadosConFlujo(yaTienenFlujo);
        setSeleccionPuestos(new Set(puestos.filter((p) => p.empleado && !yaTienenFlujo.has(p.empleado)).map((p) => p.id_puesto)));
      })
      .catch(() => {
        setPuestosVigentes([]);
        setEmpleadosConFlujo(new Set());
      })
      .finally(() => setCargandoPuestos(false));
  }

  function toggleSeleccionPuesto(idPuesto: string) {
    setSeleccionPuestos((prev) => {
      const copia = new Set(prev);
      if (copia.has(idPuesto)) copia.delete(idPuesto);
      else copia.add(idPuesto);
      return copia;
    });
  }

  async function handleGenerarLineas() {
    if (!generandoPara || !cuentaGeneracion) {
      setErrorGeneracion("Elige la cuenta bancaria de la que saldrá el pago.");
      return;
    }
    setGenerando(true);
    setErrorGeneracion(null);
    try {
      const { id_contrato } = await getContratoGenericoNomina(generandoPara.id_nomina);
      const dias = diasDelPeriodo(generandoPara);
      const puestos = puestosVigentes.filter((p) => seleccionPuestos.has(p.id_puesto));
      let creados = 0;
      for (const puesto of puestos) {
        const salario = puesto.salario_diario ? Number(puesto.salario_diario) : 0;
        const total = dias > 0 && salario > 0 ? (salario * dias).toFixed(2) : undefined;
        await createFlujo({
          contrato: id_contrato,
          cuenta: cuentaGeneracion,
          periodoNomina: generandoPara.id_nomina,
          concepto: generandoPara.serie,
          totalMxp: total,
          fechaEfectiva: generandoPara.fecha_fin || generandoPara.fecha_inicio || undefined,
          idEmpleado: puesto.empleado || undefined,
        });
        creados += 1;
      }
      setResultadoGeneracion(
        `Se generaron ${creados} línea${creados === 1 ? "" : "s"}. Monto estimado (salario diario × días del periodo) — revisa y ajusta cada Flujo antes de pagar.`
      );
      setSeleccionPuestos(new Set());
    } catch (err) {
      setErrorGeneracion(err instanceof Error ? err.message : "Error al generar las líneas");
    } finally {
      setGenerando(false);
    }
  }

  const puedeCrear = session?.perm_keys.includes("tesoreria.crear") ?? false;
  const puedeEditar = session?.perm_keys.includes("tesoreria.editar") ?? false;

  function refresh() {
    setLoading(true);
    listNominas({
      sociedad: filtroSociedad || undefined,
      proyecto: filtroProyecto || undefined,
      centro: filtroCentro || undefined,
      tipo: filtroTipo || undefined,
    })
      .then(setNominas)
      .catch((err) => setError(err instanceof Error ? err.message : "Error desconocido"))
      .finally(() => setLoading(false));
  }

  useEffect(() => {
    refresh();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filtroSociedad, filtroProyecto, filtroCentro, filtroTipo]);

  const nominasFiltradas = useMemo(() => {
    let resultado = nominas;
    if (filtroSerie) {
      resultado = resultado.filter((n) => n.serie === filtroSerie);
    }
    const busqueda = search.trim().toLowerCase();
    if (busqueda) {
      resultado = resultado.filter((n) => `${n.id_nomina} ${n.serie}`.toLowerCase().includes(busqueda));
    }
    return resultado;
  }, [nominas, search, filtroSerie]);

  const opcionesSerie = useMemo(
    () => Array.from(new Set(nominas.map((n) => n.serie))).sort(),
    [nominas]
  );

  // Aviso de "falta crear la nomina de este periodo" (10/Sep/2026,
  // "recordatorio/aviso para crear la siguiente Nomina a tiempo") - chequeo
  // en pantalla, no un correo/cron (mismo criterio "nunca se manda
  // automatico" del resto de Tesoreria): por cada tipo, si ninguna Nomina
  // ACTIVA cubre el periodo vigente para al menos una sociedad con
  // Nominas previas, se avisa. No distingue por sociedad para no
  // complicar el aviso en Fase 1 - si CUALQUIER sociedad ya tiene el
  // periodo cubierto, no se avisa (mejora futura: por sociedad).
  const avisosPeriodoFaltante = useMemo(() => {
    const sociedadesConNomina = new Set(nominas.map((n) => n.sociedad));
    if (sociedadesConNomina.size === 0) return [];
    const avisos: { tipo: TesoreriaNominaTipo; mensaje: string }[] = [];
    (["QUINCENAL", "SEMANAL"] as TesoreriaNominaTipo[]).forEach((tipo) => {
      const nominasDelTipo = nominas.filter((n) => n.tipo === tipo);
      if (nominasDelTipo.length === 0) return;
      const periodo = calcularPeriodoActual(tipo);
      const cubierto = nominasDelTipo.some(
        (n) => n.fecha_inicio === periodo.fechaInicio && n.fecha_fin === periodo.fechaFin
      );
      if (!cubierto) {
        avisos.push({ tipo, mensaje: `${TIPO_LABELS[tipo]}: falta crear "${periodo.serie}"` });
      }
    });
    return avisos;
  }, [nominas]);

  // Centro no tiene catalogo real todavia (ver memoria de sesion
  // "centro-proyecto-no-son-catalogo-generico") - "desplegable" aqui
  // significa Autocomplete freeSolo sobre lo ya capturado, no un catalogo
  // fijo: sigue permitiendo escribir un valor nuevo. Proyecto SI tiene
  // catalogo real (ver import de listProyectos arriba), no necesita esto.
  const opcionesCentro = useMemo(
    () => Array.from(new Set(nominas.map((n) => n.centro).filter((c): c is string => !!c))).sort(),
    [nominas]
  );

  function aliasProyecto(idProyecto: string): string {
    const p = proyectos.find((x) => x.id_proyecto === idProyecto);
    return p ? p.alias_proyecto || p.denominacion || idProyecto : idProyecto;
  }

  function aliasSociedad(rfc: string): string {
    const s = sociedades.find((x) => x.rfc === rfc);
    return s?.alias_sociedad || s?.razon_social || rfc;
  }

  function abrirAlta(tipo: TesoreriaNominaTipo = FORM_VACIO.tipo) {
    setEditing(null);
    setSoloLectura(false);
    setForm({ ...FORM_VACIO, tipo, ...calcularPeriodoActual(tipo) });
    setFormError(null);
    setDialogOpen(true);
  }

  function abrirDetalle(n: TesoreriaNomina, editar: boolean) {
    setEditing(n);
    setSoloLectura(!editar);
    setForm({
      tipo: n.tipo,
      sociedad: n.sociedad,
      proyecto: n.proyecto || "",
      centro: n.centro || "",
      serie: n.serie,
      fechaInicio: n.fecha_inicio || "",
      fechaFin: n.fecha_fin || "",
      status: n.status,
      comentarios: n.comentarios || "",
    });
    setFormError(null);
    setDialogOpen(true);
  }

  async function handleGuardar() {
    if (!editing && (!form.sociedad || !form.serie)) {
      setFormError("Sociedad y serie son obligatorios.");
      return;
    }
    setSaving(true);
    setFormError(null);
    try {
      if (editing) {
        await updateNomina(editing.id_nomina, {
          tipo: form.tipo,
          proyecto: form.proyecto || undefined,
          centro: form.centro || undefined,
          serie: form.serie,
          fechaInicio: form.fechaInicio || undefined,
          fechaFin: form.fechaFin || undefined,
          status: form.status,
          comentarios: form.comentarios || undefined,
        });
      } else {
        await createNomina({
          tipo: form.tipo,
          sociedad: form.sociedad,
          proyecto: form.proyecto || undefined,
          centro: form.centro || undefined,
          serie: form.serie,
          fechaInicio: form.fechaInicio || undefined,
          fechaFin: form.fechaFin || undefined,
          status: form.status,
          comentarios: form.comentarios || undefined,
        });
      }
      setDialogOpen(false);
      refresh();
    } catch (err) {
      setFormError(err instanceof Error ? err.message : "Error desconocido");
    } finally {
      setSaving(false);
    }
  }

  return (
    <AppShell>
      <Stack direction="row" alignItems="center" spacing={1.5} sx={{ mb: 0.5 }}>
        <Users size={22} strokeWidth={1.5} />
        <Typography variant="h5">Nóminas</Typography>
      </Stack>
      <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
        Periodos de nómina (Quincenal/Semanal) — cada uno se desglosa en Flujos, uno por empleado pagado.
      </Typography>

      {error && (
        <Alert severity="error" sx={{ mb: 2 }} onClose={() => setError(null)}>
          {error}
        </Alert>
      )}

      {avisosPeriodoFaltante.length > 0 && (
        <Stack spacing={1} sx={{ mb: 2 }}>
          {avisosPeriodoFaltante.map((aviso) => (
            <Alert
              key={aviso.tipo}
              severity="warning"
              action={
                puedeCrear && (
                  <Button color="inherit" size="small" onClick={() => abrirAlta(aviso.tipo)}>
                    Crear
                  </Button>
                )
              }
            >
              {aviso.mensaje}
            </Alert>
          ))}
        </Stack>
      )}

      <FiltrosBar
          search={search}
          onSearchChange={setSearch}
          searchPlaceholder="Buscar por ID de nómina o serie..."
          actions={
            puedeCrear ? (
              <Button
                size="small"
                variant="contained"
                startIcon={<Plus size={14} strokeWidth={2} />}
                onClick={() => abrirAlta()}
                sx={{ flexShrink: 0 }}
              >
                Nueva Nómina
              </Button>
            ) : undefined
          }
        >
          <FormControl size="small" sx={{ minWidth: 180 }}>
            <InputLabel id="filtro-empresa-label">Filtrar por empresa</InputLabel>
            <Select
              labelId="filtro-empresa-label"
              label="Filtrar por empresa"
              value={filtroSociedad}
              onChange={(e) => setFiltroSociedad(e.target.value)}
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
          <FormControl size="small" sx={{ minWidth: 160 }}>
            <InputLabel id="filtro-tipo-label">Tipo</InputLabel>
            <Select
              labelId="filtro-tipo-label"
              label="Tipo"
              value={filtroTipo}
              onChange={(e) => setFiltroTipo(e.target.value as TesoreriaNominaTipo | "")}
            >
              <MenuItem value="">
                <em>Todos</em>
              </MenuItem>
              <MenuItem value="QUINCENAL">Quincenal (corporativo)</MenuItem>
              <MenuItem value="SEMANAL">Semanal (obra)</MenuItem>
            </Select>
          </FormControl>
          <FormControl size="small" sx={{ minWidth: 180 }}>
            <InputLabel id="filtro-proyecto-label">Proyecto</InputLabel>
            <Select
              labelId="filtro-proyecto-label"
              label="Proyecto"
              value={filtroProyecto}
              onChange={(e) => setFiltroProyecto(e.target.value)}
            >
              <MenuItem value="">
                <em>Todos los proyectos</em>
              </MenuItem>
              {proyectos.map((p) => (
                <MenuItem key={p.id_proyecto} value={p.id_proyecto}>
                  {p.alias_proyecto || p.denominacion || p.id_proyecto}
                </MenuItem>
              ))}
            </Select>
          </FormControl>
          <Autocomplete
            freeSolo
            size="small"
            options={opcionesCentro}
            value={filtroCentro || null}
            onInputChange={(_, value) => setFiltroCentro(value)}
            renderInput={(params) => <TextField {...params} label="Centro" />}
            sx={{ minWidth: 140 }}
          />
          <Autocomplete
            size="small"
            options={opcionesSerie}
            value={filtroSerie || null}
            onChange={(_, value) => setFiltroSerie(value || "")}
            renderInput={(params) => <TextField {...params} label="Serie" />}
            sx={{ minWidth: 180 }}
          />
        </FiltrosBar>

      <Paper variant="outlined">
        {loading ? (
          <Stack alignItems="center" sx={{ py: 6 }}>
            <CircularProgress size={24} />
          </Stack>
        ) : nominasFiltradas.length === 0 ? (
          <Stack alignItems="center" sx={{ py: 4 }}>
            <Typography variant="body2" color="text.secondary">
              Sin nóminas registradas todavía.
            </Typography>
          </Stack>
        ) : (
          <TableContainer>
            <Table size="small">
              <TableHead>
                <TableRow>
                  <TableCell>ID Nómina</TableCell>
                  <TableCell>Tipo</TableCell>
                  <TableCell>Empresa</TableCell>
                  <TableCell>Proyecto</TableCell>
                  <TableCell>Serie</TableCell>
                  <TableCell>Periodo</TableCell>
                  <TableCell>Status</TableCell>
                  <TableCell align="right">Acciones</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {nominasFiltradas.map((n) => (
                  <TableRow key={n.id_nomina} hover>
                    <TableCell sx={{ fontFamily: "var(--font-mono, monospace)" }}>{n.id_nomina}</TableCell>
                    <TableCell>{TIPO_LABELS[n.tipo]}</TableCell>
                    <TableCell>{aliasSociedad(n.sociedad)}</TableCell>
                    <TableCell>{n.proyecto ? aliasProyecto(n.proyecto) : "—"}</TableCell>
                    <TableCell>{n.serie}</TableCell>
                    <TableCell>
                      {n.fecha_inicio || "—"} {n.fecha_fin ? `— ${n.fecha_fin}` : ""}
                    </TableCell>
                    <TableCell>
                      <Chip
                        size="small"
                        label={n.status === "ACTIVO" ? "Activa" : "Cerrada"}
                        color={n.status === "ACTIVO" ? "success" : "default"}
                        variant="outlined"
                      />
                    </TableCell>
                    <TableCell align="right">
                      <Stack direction="row" spacing={0.5} justifyContent="flex-end">
                        <IconButton size="small" aria-label="Ver" onClick={() => abrirDetalle(n, false)}>
                          <Eye size={16} strokeWidth={1.5} />
                        </IconButton>
                        <IconButton
                          size="small"
                          aria-label="Más acciones"
                          onClick={(e) => {
                            setMenuAnchor(e.currentTarget);
                            setMenuNomina(n);
                          }}
                        >
                          <MoreVertical size={16} strokeWidth={1.5} />
                        </IconButton>
                      </Stack>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </TableContainer>
        )}
      </Paper>

      <Menu anchorEl={menuAnchor} open={!!menuAnchor} onClose={() => setMenuAnchor(null)}>
        <MenuItem
          disabled={!puedeEditar}
          onClick={() => {
            if (menuNomina) abrirDetalle(menuNomina, true);
            setMenuAnchor(null);
          }}
        >
          <ListItemIcon>
            <Pencil size={16} strokeWidth={1.5} />
          </ListItemIcon>
          <ListItemText>Editar</ListItemText>
        </MenuItem>
        <MenuItem
          onClick={() => {
            if (menuNomina) setPanelReferencia({ tipo: "nomina", id: menuNomina.id_nomina });
            setMenuAnchor(null);
          }}
        >
          <ListItemIcon>
            <Eye size={16} strokeWidth={1.5} />
          </ListItemIcon>
          <ListItemText>Ver Flujos</ListItemText>
        </MenuItem>
        <MenuItem
          disabled={!puedeCrear}
          onClick={() => {
            if (menuNomina) abrirGenerarLineas(menuNomina);
            setMenuAnchor(null);
          }}
        >
          <ListItemIcon>
            <Zap size={16} strokeWidth={1.5} />
          </ListItemIcon>
          <ListItemText>Generar líneas por empleado activo</ListItemText>
        </MenuItem>
      </Menu>

      <Dialog open={dialogOpen} onClose={() => setDialogOpen(false)} fullWidth maxWidth="xs">
        <DialogTitle sx={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          {soloLectura ? `Ver ${editing?.id_nomina}` : editing ? `Editar ${editing.id_nomina}` : "Nueva Nómina"}
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
          <Stack component="fieldset" disabled={soloLectura} spacing={2} sx={{ border: 0, margin: 0, padding: 0, minWidth: 0 }}>
            <FormControl size="small" fullWidth>
              <InputLabel id="tipo-label">Tipo</InputLabel>
              <Select
                labelId="tipo-label"
                label="Tipo"
                value={form.tipo}
                onChange={(e) => {
                  const tipo = e.target.value as TesoreriaNominaTipo;
                  // Autocompleta fechas/serie del periodo vigente (10/Sep/2026,
                  // "debe poder en esos tiempos") - solo al crear, no al
                  // editar (editing != null deshabilita este Select mas abajo
                  // via disabled=!!editing en TesoreriaNomina.tipo... no, el
                  // Select de tipo si es editable siempre; el auto-fill solo
                  // aplica si no hay Nomina existente).
                  setForm((prev) => ({
                    ...prev,
                    tipo,
                    ...(editing ? {} : calcularPeriodoActual(tipo)),
                  }));
                }}
              >
                <MenuItem value="QUINCENAL">Quincenal (corporativo)</MenuItem>
                <MenuItem value="SEMANAL">Semanal (obra)</MenuItem>
              </Select>
            </FormControl>
            <FormControl size="small" fullWidth disabled={!!editing}>
              <InputLabel id="sociedad-label">Empresa</InputLabel>
              <Select
                labelId="sociedad-label"
                label="Empresa"
                value={form.sociedad}
                onChange={(e) => setForm({ ...form, sociedad: e.target.value })}
              >
                {sociedades.map((s) => (
                  <MenuItem key={s.rfc} value={s.rfc}>
                    {s.alias_sociedad || s.razon_social || s.rfc}
                  </MenuItem>
                ))}
              </Select>
            </FormControl>
            <FormControl size="small" fullWidth>
              <InputLabel id="proyecto-label">Proyecto</InputLabel>
              <Select
                labelId="proyecto-label"
                label="Proyecto"
                value={form.proyecto}
                onChange={(e) => setForm({ ...form, proyecto: e.target.value })}
              >
                <MenuItem value="">
                  <em>Ninguno</em>
                </MenuItem>
                {proyectos.map((p) => (
                  <MenuItem key={p.id_proyecto} value={p.id_proyecto}>
                    {p.alias_proyecto || p.denominacion || p.id_proyecto}
                  </MenuItem>
                ))}
              </Select>
              <FormHelperText>Solo aplica típicamente a nómina Semanal (obra).</FormHelperText>
            </FormControl>
            <Autocomplete
              freeSolo
              size="small"
              options={opcionesCentro}
              value={form.centro || null}
              onInputChange={(_, value) => setForm({ ...form, centro: value })}
              renderInput={(params) => <TextField {...params} label="Centro" />}
              fullWidth
            />
            <TextField
              size="small"
              label="Serie"
              value={form.serie}
              onChange={(e) => setForm({ ...form, serie: e.target.value })}
              placeholder="Q1 2026, S1 2026..."
              helperText="También es el concepto que se sugiere en cada Flujo hijo."
              fullWidth
            />
            <Stack direction="row" spacing={2}>
              <TextField
                size="small"
                type="date"
                label="Fecha inicio"
                value={form.fechaInicio}
                onChange={(e) => setForm({ ...form, fechaInicio: e.target.value })}
                InputLabelProps={{ shrink: true }}
                fullWidth
              />
              <TextField
                size="small"
                type="date"
                label="Fecha fin"
                value={form.fechaFin}
                onChange={(e) => setForm({ ...form, fechaFin: e.target.value })}
                InputLabelProps={{ shrink: true }}
                fullWidth
              />
            </Stack>
            {editing && (
              <FormControl size="small" fullWidth>
                <InputLabel id="status-label">Status</InputLabel>
                <Select
                  labelId="status-label"
                  label="Status"
                  value={form.status}
                  onChange={(e) => setForm({ ...form, status: e.target.value as TesoreriaNominaStatus })}
                >
                  <MenuItem value="ACTIVO">Activa</MenuItem>
                  <MenuItem value="CERRADA">Cerrada</MenuItem>
                </Select>
              </FormControl>
            )}
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
        {!soloLectura && (
          <DialogActions>
            <Button onClick={() => setDialogOpen(false)}>Cancelar</Button>
            <Button variant="contained" onClick={handleGuardar} disabled={saving}>
              {saving ? <CircularProgress size={16} /> : "Guardar"}
            </Button>
          </DialogActions>
        )}
      </Dialog>

      <Dialog open={!!generandoPara} onClose={() => setGenerandoPara(null)} fullWidth maxWidth="sm">
        <DialogTitle sx={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          Generar líneas — {generandoPara?.serie}
          <IconButton onClick={() => setGenerandoPara(null)} size="small" aria-label="Cerrar">
            <CloseIcon size={18} strokeWidth={1.5} />
          </IconButton>
        </DialogTitle>
        <DialogContent dividers>
          <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
            Crea un Flujo por cada Puesto vigente de {generandoPara && aliasSociedad(generandoPara.sociedad)}
            {generandoPara?.proyecto ? ` — ${aliasProyecto(generandoPara.proyecto)}` : ""}. El monto es un{" "}
            <strong>estimado</strong> (salario diario × días del periodo), sin ISR/IMSS ni otras deducciones —
            revisa y ajusta cada Flujo antes de pagar.
          </Typography>
          {errorGeneracion && (
            <Alert severity="error" sx={{ mb: 2 }}>
              {errorGeneracion}
            </Alert>
          )}
          {resultadoGeneracion && (
            <Alert severity="success" sx={{ mb: 2 }}>
              {resultadoGeneracion}
            </Alert>
          )}
          <FormControl size="small" fullWidth sx={{ mb: 2 }}>
            <InputLabel id="cuenta-generacion-label">Cuenta bancaria</InputLabel>
            <Select
              labelId="cuenta-generacion-label"
              label="Cuenta bancaria"
              value={cuentaGeneracion}
              onChange={(e) => setCuentaGeneracion(e.target.value)}
            >
              {cuentas.map((c) => (
                <MenuItem key={c.id_cuenta_bancaria} value={c.id_cuenta_bancaria}>
                  {c.alias || c.clabe}
                </MenuItem>
              ))}
            </Select>
          </FormControl>
          {cargandoPuestos ? (
            <Stack alignItems="center" sx={{ py: 3 }}>
              <CircularProgress size={20} />
            </Stack>
          ) : puestosVigentes.length === 0 ? (
            <Typography variant="body2" color="text.secondary">
              No hay Puestos vigentes para esta sociedad/proyecto en rrhh-service.
            </Typography>
          ) : (
            <Stack spacing={0.5}>
              {puestosVigentes.map((p) => {
                const yaTiene = p.empleado ? empleadosConFlujo.has(p.empleado) : false;
                const dias = diasDelPeriodo(generandoPara as TesoreriaNomina);
                const estimado = p.salario_diario && dias > 0 ? (Number(p.salario_diario) * dias).toFixed(2) : "—";
                return (
                  <FormControlLabel
                    key={p.id_puesto}
                    control={
                      <Checkbox
                        size="small"
                        checked={seleccionPuestos.has(p.id_puesto)}
                        onChange={() => toggleSeleccionPuesto(p.id_puesto)}
                        disabled={yaTiene}
                      />
                    }
                    label={
                      <Typography variant="body2">
                        {p.empleado_nombre || p.empleado || "—"} — {p.puesto || "Sin puesto"} — ${estimado}
                        {yaTiene && " (ya tiene un Flujo en esta nómina)"}
                      </Typography>
                    }
                  />
                );
              })}
            </Stack>
          )}
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setGenerandoPara(null)}>Cerrar</Button>
          <Button
            variant="contained"
            onClick={handleGenerarLineas}
            disabled={generando || seleccionPuestos.size === 0 || !cuentaGeneracion}
          >
            {generando ? <CircularProgress size={16} /> : `Generar ${seleccionPuestos.size} línea(s)`}
          </Button>
        </DialogActions>
      </Dialog>

      <PanelReferenciaCruzada referencia={panelReferencia} onClose={() => setPanelReferencia(null)} />
    </AppShell>
  );
}
