"use client";

import { useEffect, useMemo, useState } from "react";
import {
  Alert,
  Autocomplete,
  Button,
  Chip,
  CircularProgress,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  FormControl,
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
import { Eye, MoreVertical, Pencil, Plus, Users, X as CloseIcon } from "lucide-react";
import AppShell from "@/components/AppShell";
import FiltrosBar from "@/components/FiltrosBar";
import PanelReferenciaCruzada, { ReferenciaCruzada } from "@/components/PanelReferenciaCruzada";
import { SessionUser, getSession } from "@/lib/auth";
import { GeneralSociedad, listSociedades } from "@/lib/iam";
import { ViviendaProyecto, listProyectos } from "@/lib/vivienda";
import {
  TesoreriaNomina,
  TesoreriaNominaStatus,
  TesoreriaNominaTipo,
  createNomina,
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
  return {
    fechaInicio: fechaISO(inicio),
    fechaFin: fechaISO(fin),
    serie: `Quincena ${esPrimeraQuincena ? 1 : 2} - ${MESES[mes]} ${anio}`,
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
  return {
    fechaInicio: fechaISO(lunes),
    fechaFin: fechaISO(viernes),
    serie: `Semana del ${lunes.getDate()} al ${viernes.getDate()} de ${MESES[viernes.getMonth()]} ${viernes.getFullYear()}`,
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

  useEffect(() => {
    getSession().then(setSession);
    listSociedades().then(setSociedades).catch(() => setSociedades([]));
    listProyectos().then(setProyectos).catch(() => setProyectos([]));
  }, []);

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
    const busqueda = search.trim().toLowerCase();
    if (!busqueda) return nominas;
    return nominas.filter((n) => `${n.id_nomina} ${n.serie}`.toLowerCase().includes(busqueda));
  }, [nominas, search]);

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

      <Paper variant="outlined" sx={{ mb: 3 }}>
        <FiltrosBar
          flush
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
        </FiltrosBar>

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

      <PanelReferenciaCruzada referencia={panelReferencia} onClose={() => setPanelReferencia(null)} />
    </AppShell>
  );
}
