"use client";

import { Suspense, useEffect, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
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
  Divider,
  FormControl,
  FormControlLabel,
  IconButton,
  InputAdornment,
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
import {
  Eye,
  ExternalLink,
  FilePenLine,
  FileText,
  MoreVertical,
  Pencil,
  Plus,
  Search,
  Shield,
  Trash2,
  Users,
  X as CloseIcon,
} from "lucide-react";
import AppShell from "@/components/AppShell";
import { SessionUser, getSession } from "@/lib/auth";
import { GeneralSociedad, IamUser, listSociedades, listUsers } from "@/lib/iam";
import {
  TesoreriaComplementoPago,
  TesoreriaContraparte,
  TesoreriaContraparteRelacion,
  TesoreriaContrato,
  TesoreriaFactura,
  TesoreriaNotaCredito,
  TesoreriaTipoPersona,
  TesoreriaTipoRelacion,
  createContraparte,
  createContraparteRelacion,
  deleteContraparte,
  deleteContraparteRelacion,
  generarIdCorto,
  listComplementosPago,
  listContraparteRelaciones,
  listContrapartes,
  listContratos,
  listFacturas,
  listNotasCredito,
  updateContraparte,
} from "@/lib/tesoreria";

const TIPO_RELACION_LABELS: Record<TesoreriaTipoRelacion, string> = {
  "REP LEGAL": "Representante legal",
  "BENEF CONTROLADOR": "Beneficiario controlador",
};

const TIPO_PERSONA_LABELS: Record<TesoreriaTipoPersona, string> = {
  fisica: "Física",
  moral: "Moral",
  fisica_act_emp: "Física con actividad empresarial",
  fideicomiso: "Fideicomiso",
};

const FORM_VACIO = {
  razonSocial: "",
  rfc: "",
  apellidoPaterno: "",
  apellidoMaterno: "",
  // "" cabe aqui (union con TesoreriaTipoPersona) porque una contraparte
  // pudo haberse dado de alta minima desde otro modulo (ej. PLD, ver
  // docs/architecture, "contraparte maestra unica") sin este campo todavia.
  tipoPersona: "moral" as TesoreriaTipoPersona | "",
  genero: "" as "MUJER" | "HOMBRE" | "X" | "",
  email: "",
  contacto: "",
  telefonoSms: "",
  cliente: false,
  proveedor: false,
  comentarios: "",
  permiso: "",
  autorizadoPor: "",
};

// Catalogo maestro de contrapartes (arranque formal de Fase 4, 18/Ago/2026)
// - primera pantalla real de tesoreria-service. Sin ScopedManager a
// proposito (catalogo compartido entre sociedades, ver
// tesoreria/serializers.py) - el filtro real es por permiso
// (tesoreria.crear/.editar), mismo criterio que /admin/organizacion.
// useSearchParams() obliga a envolver en Suspense para el build de
// produccion (mismo motivo ya documentado en tesoreria/contratos/page.tsx) -
// lo necesitamos para el deep link "?revisar=" desde el aviso de Flujos.
export default function TesoreriaContrapartesPage() {
  return (
    <Suspense fallback={null}>
      <TesoreriaContrapartesPageContent />
    </Suspense>
  );
}

function TesoreriaContrapartesPageContent() {
  const searchParams = useSearchParams();
  const [session, setSession] = useState<SessionUser | null>(null);
  const [contrapartes, setContrapartes] = useState<TesoreriaContraparte[]>([]);
  // Filtro "pendientes de revision" (creadas por IA en confirmar_conciliacion,
  // ver origen en tesoreria.ts) - quedan con email/tipo_persona vacios y
  // nadie se enteraba antes de que existiera este filtro.
  const [soloPendientesIA, setSoloPendientesIA] = useState(false);
  // "Autorizado por" se llena de colaboradores internos (28/Ago/2026,
  // pedido explicito de Mariana), no texto libre - filtro access_mode=
  // STANDARD (interno/Workspace) para no mezclar proveedores/externos que
  // tambien viven en iam-service (ver docstring de IamUser.access_mode).
  const [colaboradores, setColaboradores] = useState<IamUser[]>([]);
  // created_by/updated_by guardan el user_id crudo (ver perform_create en
  // views.py) - este mapa lo resuelve al correo para mostrarlo legible
  // (28/Ago/2026, pedido explicito de Mariana: "no el id, sino el correo
  // electronico"). Cae de vuelta al ID crudo si el usuario ya no esta en
  // el directorio STANDARD activo (ej. fue borrado o es externo).
  const emailPorUserId = useMemo(() => {
    const mapa: Record<string, string> = {};
    colaboradores.forEach((u) => {
      mapa[u.user_id] = u.primary_email;
    });
    return mapa;
  }, [colaboradores]);
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<TesoreriaContraparte | null>(null);
  // Ver vs. Editar (28/Ago/2026, pedido explicito de Mariana: "en los tres
  // puntos lo de editar y en su lugar agrega un boton de ver") - mismo
  // dialogo, mismo formulario, pero con todo deshabilitado y sin boton de
  // Guardar cuando soloLectura es true. "Ver" queda visible siempre;
  // "Editar" se mueve al menu de tres puntos (gateado por puedeEditar).
  const [soloLectura, setSoloLectura] = useState(false);
  const [form, setForm] = useState(FORM_VACIO);
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  // ID mostrado en el dialogo de alta - generado al abrirlo, ver abrirAlta().
  const [idNuevo, setIdNuevo] = useState("");
  // Apellidos y genero solo aplican a personas fisicas (28/Ago/2026, pedido
  // explicito de Mariana: "no puede pedir apellidos si es moral") - una
  // razon social (Moral/Fideicomiso) no tiene apellidos ni genero.
  const esPersonaFisica = form.tipoPersona === "fisica" || form.tipoPersona === "fisica_act_emp";
  // "Contacto" es un dato legal distinto del Titular (02/Sep/2026,
  // aclaracion explicita: el Titular debe identificarse con sus datos
  // reales -Nombre, RFC/CURP- por el Principio de Calidad de la LFPDPPP;
  // el Contacto puede ser un "contacto autorizado"/domicilio convencional
  // DISTINTO de la contraparte, respaldado por el Art. 34 del Codigo Civil
  // Federal) - NUNCA se autocompleta solo. Este checkbox es la unica via:
  // el usuario decide explicitamente que, en este caso, el contacto SI es
  // el mismo titular, y solo entonces se copia (y se mantiene sincronizado
  // mientras siga marcado) - ver handleToggleContactoMismoTitular.
  const [contactoMismoTitular, setContactoMismoTitular] = useState(false);
  function nombreCompletoFisica(razonSocial: string, apellidoPaterno: string, apellidoMaterno: string) {
    return [razonSocial, apellidoPaterno, apellidoMaterno]
      .map((parte) => parte.trim())
      .filter(Boolean)
      .join(" ");
  }
  function handleToggleContactoMismoTitular(checked: boolean) {
    setContactoMismoTitular(checked);
    if (checked) {
      setForm((f) => ({
        ...f,
        contacto: nombreCompletoFisica(f.razonSocial, f.apellidoPaterno, f.apellidoMaterno),
      }));
    }
    // Al desmarcar NO se borra el contacto - se queda el ultimo valor
    // (probablemente el nombre del titular que se copio) editable a mano,
    // el usuario decide si lo cambia por el contacto autorizado real.
  }

  // Relaciones (rep. legal / benef. controlador, dato pedido por PLD/AML) -
  // dialogo por contraparte, ver TesoreriaContraparteRelacionViewSet
  // (filtro ?contraparte=<id>).
  const [relacionesContraparte, setRelacionesContraparte] = useState<TesoreriaContraparte | null>(null);
  const [relaciones, setRelaciones] = useState<TesoreriaContraparteRelacion[]>([]);
  const [loadingRelaciones, setLoadingRelaciones] = useState(false);
  const [relacionFormOpen, setRelacionFormOpen] = useState(false);
  const [relacionForm, setRelacionForm] = useState({ contraparteRelacion: "", tipoRelacion: "REP LEGAL" as TesoreriaTipoRelacion });
  const [savingRelacion, setSavingRelacion] = useState(false);
  const [relacionFormError, setRelacionFormError] = useState<string | null>(null);
  // ID mostrado en el formulario inline de alta - generado al abrirlo.
  const [idRelacionNueva, setIdRelacionNueva] = useState("");

  // Documentos (vista por proveedor, 25/Ago/2026) - facturas/complementos/
  // notas de credito ligados a esta contraparte via el FK contraparte
  // (auto-llenado por RFC, ver _vincular_contraparte_por_rfc en views.py).
  const [documentosContraparte, setDocumentosContraparte] = useState<TesoreriaContraparte | null>(null);
  const [docFacturas, setDocFacturas] = useState<TesoreriaFactura[]>([]);
  const [docComplementos, setDocComplementos] = useState<TesoreriaComplementoPago[]>([]);
  const [docNotasCredito, setDocNotasCredito] = useState<TesoreriaNotaCredito[]>([]);
  const [loadingDocumentos, setLoadingDocumentos] = useState(false);

  // Contratos de una contraparte (28/Ago/2026, "para la contraparte que
  // cree, creale varios contratos ya que es una relacion de 1:N") -
  // dialogo de solo lectura por contraparte, mismo patron que Relaciones.
  // El alta de contratos se quito de aqui (28/Ago/2026, pedido explicito de
  // Mariana: "quita lo de contrapartes, nuevo contrato") - se crea
  // exclusivamente desde /tesoreria/contratos; aqui solo se listan los de
  // esta contraparte y cada uno linkea alla.
  const [contratosContraparte, setContratosContraparte] = useState<TesoreriaContraparte | null>(null);
  const [contratos, setContratos] = useState<TesoreriaContrato[]>([]);
  const [loadingContratos, setLoadingContratos] = useState(false);

  // Menu compacto de acciones por fila (28/Ago/2026, "muy peques" - mismo
  // patron ya usado en Flujos, ver flujos/page.tsx) - Editar se queda como
  // icono visible, el resto (Contratos/Documentos/Relaciones/Borrar) vive
  // detras del kebab para no apretar 5 iconos en la misma celda.
  const [menuAnchor, setMenuAnchor] = useState<HTMLElement | null>(null);
  const [menuContraparte, setMenuContraparte] = useState<TesoreriaContraparte | null>(null);
  // Confirmacion de borrado (02/Sep/2026, pedido explicito: "esto debe ser
  // una pantalla en la ui no asi") - antes usaba window.confirm() nativo
  // del navegador, se reemplaza por un Dialog propio de MUI consistente
  // con el resto de la pantalla.
  const [borrando, setBorrando] = useState<TesoreriaContraparte | null>(null);
  const [borrandoError, setBorrandoError] = useState<string | null>(null);
  const [borrandoLoading, setBorrandoLoading] = useState(false);

  // Catalogo de sociedades (02/Sep/2026, pedido explicito: "pero por
  // nombre") - c.sociedades del backend solo trae el RFC (referencia laxa
  // a general_sociedades, ver TesoreriaContrato.sociedad), se resuelve a
  // razon_social del lado del cliente, mismo patron que pld/page.tsx.
  const [sociedades, setSociedades] = useState<GeneralSociedad[]>([]);
  useEffect(() => {
    listSociedades()
      .then(setSociedades)
      .catch(() => setSociedades([]));
  }, []);
  const nombreSociedad = (rfc: string) => sociedades.find((s) => s.rfc === rfc)?.razon_social || rfc;
  // Filtro por sociedad (02/Sep/2026, pedido explicito: "en todo donde
  // aparezca una sociedad agrega el filtro por sociedad") - mismo criterio
  // que contratos/page.tsx, aplicado sobre la columna Sociedad de esta
  // pantalla (derivada de los Contratos de cada contraparte).
  const [filtroSociedad, setFiltroSociedad] = useState("");

  useEffect(() => {
    getSession().then(setSession);
    listUsers({ accessMode: "STANDARD" }).then(setColaboradores).catch(() => setColaboradores([]));
  }, []);

  const puedeCrear = session?.perm_keys.includes("tesoreria.crear") ?? false;
  const puedeEditar = session?.perm_keys.includes("tesoreria.editar") ?? false;

  function refresh() {
    setLoading(true);
    listContrapartes(search || undefined, undefined, filtroSociedad || undefined)
      .then(setContrapartes)
      .catch((err) => setError(err instanceof Error ? err.message : "Error desconocido"))
      .finally(() => setLoading(false));
  }

  useEffect(() => {
    const timeout = setTimeout(refresh, 300);
    return () => clearTimeout(timeout);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [search, filtroSociedad]);

  // ?revisar=<id_contraparte> - link directo desde flujos/page.tsx cuando
  // confirmar_conciliacion detecta/crea una contraparte por IA (ver
  // handleConfirmarConciliacionFlujo) - abre de una vez el dialogo de
  // edicion para completar email/tipo_persona sin que el analista tenga
  // que buscarla a mano.
  const revisarId = searchParams.get("revisar");
  useEffect(() => {
    if (!revisarId || contrapartes.length === 0) return;
    const c = contrapartes.find((x) => x.id_contraparte === revisarId);
    if (c) abrirEdicion(c);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [revisarId, contrapartes]);

  // Pendiente de revision = creada por IA y todavia le falta lo que Tesoreria
  // exige para una alta manual (email/tipo_persona, ver models.py).
  function pendienteRevisionIA(c: TesoreriaContraparte): boolean {
    return c.origen === "ia" && (!c.email || !c.tipo_persona);
  }

  const contrapartesMostradas = useMemo(
    () => (soloPendientesIA ? contrapartes.filter(pendienteRevisionIA) : contrapartes),
    [contrapartes, soloPendientesIA]
  );
  const totalPendientesIA = useMemo(() => contrapartes.filter(pendienteRevisionIA).length, [contrapartes]);

  function abrirAlta() {
    setEditing(null);
    setSoloLectura(false);
    setForm(FORM_VACIO);
    setIdNuevo(generarIdCorto());
    setFormError(null);
    setContactoMismoTitular(false);
    setDialogOpen(true);
  }

  function abrirEdicion(c: TesoreriaContraparte, verSolo = false) {
    setEditing(c);
    setSoloLectura(verSolo);
    setForm({
      razonSocial: c.razon_social,
      rfc: c.rfc || "",
      apellidoPaterno: c.apellido_paterno || "",
      apellidoMaterno: c.apellido_materno || "",
      tipoPersona: c.tipo_persona || "",
      genero: c.genero || "",
      email: c.email || "",
      contacto: c.contacto || "",
      telefonoSms: c.telefono_sms || "",
      cliente: c.cliente,
      proveedor: c.proveedor,
      comentarios: c.comentarios || "",
      permiso: c.permiso || "",
      autorizadoPor: c.autorizado_por || "",
    });
    setFormError(null);
    // El checkbox arranca marcado SOLO si el contacto ya guardado coincide
    // exactamente con nombre+apellidos del titular - es una inferencia
    // razonable de "esto ya estaba en modo mismo titular", no una
    // sincronizacion forzada; si el analista lo desmarca, el contacto se
    // queda como esta y deja de recalcularse.
    const autoCalculado = nombreCompletoFisica(
      c.razon_social,
      c.apellido_paterno || "",
      c.apellido_materno || ""
    );
    setContactoMismoTitular(Boolean(c.contacto) && c.contacto === autoCalculado);
    setDialogOpen(true);
  }

  async function handleGuardar() {
    if (!form.razonSocial.trim()) {
      setFormError("La razón social es requerida.");
      return;
    }
    // email y tipo_persona vuelven a ser obligatorios (28/Ago/2026, pedido
    // explicito de Mariana, revierte la alta minima del 19/Ago/2026 - ver
    // TesoreriaContraparte.email/tipo_persona en models.py).
    if (!form.email.trim()) {
      setFormError("El correo es requerido.");
      return;
    }
    if (!form.tipoPersona) {
      setFormError("El tipo de persona es requerido.");
      return;
    }
    setSaving(true);
    setFormError(null);
    try {
      const params = {
        razonSocial: form.razonSocial,
        rfc: form.rfc || null,
        apellidoPaterno: form.apellidoPaterno || null,
        apellidoMaterno: form.apellidoMaterno || null,
        tipoPersona: form.tipoPersona || null,
        genero: form.genero || null,
        email: form.email || null,
        contacto: form.contacto || null,
        telefonoSms: form.telefonoSms || null,
        cliente: form.cliente,
        proveedor: form.proveedor,
        comentarios: form.comentarios || null,
        permiso: form.permiso || null,
        autorizadoPor: form.autorizadoPor || null,
      };
      if (editing) {
        await updateContraparte(editing.id_contraparte, params);
      } else {
        await createContraparte({ ...params, idContraparte: idNuevo });
      }
      setDialogOpen(false);
      refresh();
    } catch (err) {
      setFormError(err instanceof Error ? err.message : "Error desconocido");
    } finally {
      setSaving(false);
    }
  }

  function handleBorrar(c: TesoreriaContraparte) {
    setBorrandoError(null);
    setBorrando(c);
  }

  async function confirmarBorrar() {
    if (!borrando) return;
    setBorrandoLoading(true);
    setBorrandoError(null);
    try {
      await deleteContraparte(borrando.id_contraparte);
      setBorrando(null);
      refresh();
    } catch (err) {
      setBorrandoError(err instanceof Error ? err.message : "Error desconocido");
    } finally {
      setBorrandoLoading(false);
    }
  }

  function abrirDocumentos(c: TesoreriaContraparte) {
    setDocumentosContraparte(c);
    setLoadingDocumentos(true);
    Promise.all([
      listFacturas(undefined, c.id_contraparte),
      listComplementosPago(undefined, c.id_contraparte),
      listNotasCredito(undefined, c.id_contraparte),
    ])
      .then(([facturas, complementos, notas]) => {
        setDocFacturas(facturas);
        setDocComplementos(complementos);
        setDocNotasCredito(notas);
      })
      .catch((err) => setError(err instanceof Error ? err.message : "Error desconocido"))
      .finally(() => setLoadingDocumentos(false));
  }

  function abrirRelaciones(c: TesoreriaContraparte) {
    setRelacionesContraparte(c);
    setRelacionForm({ contraparteRelacion: "", tipoRelacion: "REP LEGAL" });
    setRelacionFormError(null);
    setRelacionFormOpen(false);
    refreshRelaciones(c.id_contraparte);
  }

  function refreshRelaciones(idContraparte: string) {
    setLoadingRelaciones(true);
    listContraparteRelaciones(idContraparte)
      .then(setRelaciones)
      .catch((err) => setError(err instanceof Error ? err.message : "Error desconocido"))
      .finally(() => setLoadingRelaciones(false));
  }

  async function handleGuardarRelacion() {
    if (!relacionesContraparte) return;
    if (!relacionForm.contraparteRelacion) {
      setRelacionFormError("Selecciona la persona relacionada.");
      return;
    }
    setSavingRelacion(true);
    setRelacionFormError(null);
    try {
      await createContraparteRelacion({
        idRelacion: idRelacionNueva,
        contraparte: relacionesContraparte.id_contraparte,
        contraparteRelacion: relacionForm.contraparteRelacion,
        tipoRelacion: relacionForm.tipoRelacion,
      });
      setRelacionFormOpen(false);
      refreshRelaciones(relacionesContraparte.id_contraparte);
    } catch (err) {
      setRelacionFormError(err instanceof Error ? err.message : "Error desconocido");
    } finally {
      setSavingRelacion(false);
    }
  }

  async function handleBorrarRelacion(r: TesoreriaContraparteRelacion) {
    if (!relacionesContraparte) return;
    if (!window.confirm("¿Borrar esta relación? Esta acción no se puede deshacer.")) {
      return;
    }
    try {
      await deleteContraparteRelacion(r.id_relacion);
      refreshRelaciones(relacionesContraparte.id_contraparte);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error desconocido");
    }
  }

  function abrirContratos(c: TesoreriaContraparte) {
    setContratosContraparte(c);
    refreshContratos(c.id_contraparte);
  }

  function refreshContratos(idContraparte: string) {
    setLoadingContratos(true);
    listContratos(undefined, idContraparte)
      .then(setContratos)
      .catch((err) => setError(err instanceof Error ? err.message : "Error desconocido"))
      .finally(() => setLoadingContratos(false));
  }

  return (
    <AppShell>
      <Stack direction="row" alignItems="center" spacing={1.5} sx={{ mb: 0.5 }}>
        <Users size={22} strokeWidth={1.5} />
        <Typography variant="h5">Contrapartes</Typography>
      </Stack>
      <Typography variant="body2" color="text.secondary" sx={{ mb: 3 }}>
        Catálogo maestro de contrapartes (clientes/proveedores) — compartido entre sociedades, base para
        generar contratos de Tesorería.
      </Typography>

      {error && (
        <Alert severity="error" sx={{ mb: 3 }}>
          {error}
        </Alert>
      )}

      <Paper variant="outlined">
        <Stack direction={{ xs: "column", sm: "row" }} spacing={2} alignItems="center" sx={{ p: 2 }}>
          <TextField
            size="small"
            placeholder="Buscar por razón social, RFC o contacto..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            sx={{ flex: 1, maxWidth: 320 }}
            InputProps={{
              startAdornment: (
                <InputAdornment position="start">
                  <Search size={16} strokeWidth={1.5} />
                </InputAdornment>
              ),
            }}
          />
          <FormControl size="small" sx={{ minWidth: 200 }}>
            <InputLabel id="filtro-sociedad-contraparte-label">Filtrar por sociedad</InputLabel>
            <Select
              labelId="filtro-sociedad-contraparte-label"
              label="Filtrar por sociedad"
              value={filtroSociedad}
              onChange={(e) => setFiltroSociedad(e.target.value)}
            >
              <MenuItem value="">
                <em>Todas las sociedades</em>
              </MenuItem>
              {sociedades.map((s) => (
                <MenuItem key={s.rfc} value={s.rfc}>
                  {s.alias_sociedad || s.razon_social || s.rfc}
                </MenuItem>
              ))}
            </Select>
          </FormControl>
          <FormControlLabel
            control={
              <Checkbox
                size="small"
                checked={soloPendientesIA}
                onChange={(e) => setSoloPendientesIA(e.target.checked)}
              />
            }
            label={`Pendientes de revisión (IA)${totalPendientesIA > 0 ? ` (${totalPendientesIA})` : ""}`}
          />
          {puedeCrear && (
            <Button
              size="small"
              variant="contained"
              startIcon={<Plus size={14} strokeWidth={2} />}
              onClick={abrirAlta}
              sx={{ ml: { sm: "auto" } }}
            >
              Nueva Contraparte
            </Button>
          )}
        </Stack>
        {/* Tabla normal en pantallas >= sm; en celular (xs) se reemplaza por
        tarjetas apiladas (ver abajo) - una tabla de 6+ columnas no cabe en
        un telefono sin scroll horizontal incomodo. */}
        <Box sx={{ display: { xs: "none", sm: "block" } }}>
          <TableContainer>
            <Table size="small">
              <TableHead>
                <TableRow>
                  <TableCell>ID</TableCell>
                  <TableCell>Razón social</TableCell>
                  <TableCell>RFC</TableCell>
                  <TableCell>Tipo</TableCell>
                  <TableCell>Nombre del contacto</TableCell>
                  {/* Sociedad (02/Sep/2026, pedido explicito: "no veo en
                  contraparte a que empresa esta 'asociada'" - "igual para
                  personas fisica, etc") - misma columna para cualquier
                  tipo_persona, no es exclusiva de moral. La contraparte en
                  si no tiene sociedad propia (catalogo compartido, ver
                  TesoreriaContraparteSerializer.get_sociedades) - se
                  deriva de sus Contratos, por eso puede mostrar varias o
                  "—" si todavia no tiene ninguno. */}
                  <TableCell>Sociedad</TableCell>
                  <TableCell>Cliente / Proveedor</TableCell>
                  <TableCell align="right">Acciones</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {loading ? (
                  <TableRow>
                    <TableCell colSpan={8} align="center" sx={{ py: 3 }}>
                      <CircularProgress size={20} />
                    </TableCell>
                  </TableRow>
                ) : contrapartesMostradas.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={8} align="center" sx={{ py: 3 }}>
                      <Typography variant="body2" color="text.secondary">
                        {soloPendientesIA ? "Sin contrapartes pendientes de revisión." : "Sin contrapartes registradas."}
                      </Typography>
                    </TableCell>
                  </TableRow>
                ) : (
                  contrapartesMostradas.map((c) => (
                    <TableRow key={c.id_contraparte} hover selected={pendienteRevisionIA(c)}>
                      <TableCell sx={{ fontFamily: "var(--font-mono, monospace)" }}>{c.id_contraparte}</TableCell>
                      <TableCell>
                        <Stack direction="row" spacing={0.75} alignItems="center">
                          <span>{c.razon_social}</span>
                          {c.origen === "ia" && (
                            <Chip
                              size="small"
                              label={pendienteRevisionIA(c) ? "IA — revisar" : "IA"}
                              color={pendienteRevisionIA(c) ? "warning" : "default"}
                              variant="outlined"
                            />
                          )}
                        </Stack>
                      </TableCell>
                      <TableCell sx={{ fontFamily: "var(--font-mono, monospace)" }}>{c.rfc || "—"}</TableCell>
                      <TableCell>{c.tipo_persona ? TIPO_PERSONA_LABELS[c.tipo_persona] ?? c.tipo_persona : "—"}</TableCell>
                      <TableCell>{c.contacto || c.email || "—"}</TableCell>
                      <TableCell>{c.sociedades?.length > 0 ? c.sociedades.map(nombreSociedad).join(", ") : "—"}</TableCell>
                      <TableCell>
                        <Stack direction="row" spacing={0.5}>
                          {c.cliente && <Chip size="small" label="Cliente" color="success" variant="outlined" />}
                          {c.proveedor && <Chip size="small" label="Proveedor" color="info" variant="outlined" />}
                          {!c.cliente && !c.proveedor && "—"}
                        </Stack>
                      </TableCell>
                      <TableCell align="right">
                        <Stack direction="row" spacing={0.5} justifyContent="flex-end">
                          <IconButton size="small" aria-label="Ver" onClick={() => abrirEdicion(c, true)}>
                            <Eye size={14} strokeWidth={1.5} />
                          </IconButton>
                          <IconButton
                            size="small"
                            aria-label="Más acciones"
                            onClick={(e) => {
                              setMenuAnchor(e.currentTarget);
                              setMenuContraparte(c);
                            }}
                          >
                            <MoreVertical size={14} strokeWidth={1.5} />
                          </IconButton>
                        </Stack>
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </TableContainer>
        </Box>

        {/* Tarjetas apiladas - solo celular (xs), ver comentario arriba. */}
        <Stack spacing={1.5} sx={{ display: { xs: "flex", sm: "none" }, p: 2 }}>
          {loading ? (
            <Stack alignItems="center" sx={{ py: 3 }}>
              <CircularProgress size={20} />
            </Stack>
          ) : contrapartesMostradas.length === 0 ? (
            <Typography variant="body2" color="text.secondary" sx={{ py: 3, textAlign: "center" }}>
              {soloPendientesIA ? "Sin contrapartes pendientes de revisión." : "Sin contrapartes registradas."}
            </Typography>
          ) : (
            contrapartesMostradas.map((c) => (
              <Paper key={c.id_contraparte} variant="outlined" sx={{ p: 2 }}>
                <Stack direction="row" justifyContent="space-between" alignItems="flex-start" spacing={1}>
                  <Stack spacing={0.25} sx={{ minWidth: 0 }}>
                    <Stack direction="row" spacing={0.75} alignItems="center">
                      <Typography variant="subtitle2">{c.razon_social}</Typography>
                      {c.origen === "ia" && (
                        <Chip
                          size="small"
                          label={pendienteRevisionIA(c) ? "IA — revisar" : "IA"}
                          color={pendienteRevisionIA(c) ? "warning" : "default"}
                          variant="outlined"
                        />
                      )}
                    </Stack>
                    <Typography variant="caption" color="text.secondary" sx={{ fontFamily: "var(--font-mono, monospace)" }}>
                      {c.id_contraparte}
                    </Typography>
                  </Stack>
                  <Stack direction="row" spacing={0.5} sx={{ flexShrink: 0 }}>
                    <IconButton size="small" aria-label="Ver" onClick={() => abrirEdicion(c, true)}>
                      <Eye size={14} strokeWidth={1.5} />
                    </IconButton>
                    <IconButton
                      size="small"
                      aria-label="Más acciones"
                      onClick={(e) => {
                        setMenuAnchor(e.currentTarget);
                        setMenuContraparte(c);
                      }}
                    >
                      <MoreVertical size={14} strokeWidth={1.5} />
                    </IconButton>
                  </Stack>
                </Stack>
                <Stack spacing={0.5} sx={{ mt: 1 }}>
                  <Typography variant="body2">
                    <strong>RFC:</strong> {c.rfc || "—"}
                  </Typography>
                  <Typography variant="body2">
                    <strong>Tipo:</strong> {c.tipo_persona ? TIPO_PERSONA_LABELS[c.tipo_persona] ?? c.tipo_persona : "—"}
                  </Typography>
                  <Typography variant="body2">
                    <strong>Nombre del contacto:</strong> {c.contacto || c.email || "—"}
                  </Typography>
                  <Typography variant="body2">
                    <strong>Sociedad:</strong> {c.sociedades?.length > 0 ? c.sociedades.map(nombreSociedad).join(", ") : "—"}
                  </Typography>
                  <Stack direction="row" spacing={0.5}>
                    {c.cliente && <Chip size="small" label="Cliente" color="success" variant="outlined" />}
                    {c.proveedor && <Chip size="small" label="Proveedor" color="info" variant="outlined" />}
                  </Stack>
                </Stack>
              </Paper>
            ))
          )}
        </Stack>
      </Paper>

      {/* Menu compacto de acciones por fila - un solo lugar para tabla y
      tarjetas (ver setMenuAnchor/setMenuContraparte arriba). */}
      <Menu
        anchorEl={menuAnchor}
        open={!!menuAnchor}
        onClose={() => {
          setMenuAnchor(null);
          setMenuContraparte(null);
        }}
      >
        {menuContraparte && [
          <MenuItem
            key="editar"
            disabled={!puedeEditar}
            onClick={() => {
              abrirEdicion(menuContraparte);
              setMenuAnchor(null);
            }}
          >
            <ListItemIcon>
              <Pencil size={16} strokeWidth={1.5} />
            </ListItemIcon>
            <ListItemText>Editar</ListItemText>
          </MenuItem>,
          <MenuItem
            key="contratos"
            onClick={() => {
              abrirContratos(menuContraparte);
              setMenuAnchor(null);
            }}
          >
            <ListItemIcon>
              <FilePenLine size={16} strokeWidth={1.5} />
            </ListItemIcon>
            <ListItemText>Contratos</ListItemText>
          </MenuItem>,
          <MenuItem
            key="documentos"
            onClick={() => {
              abrirDocumentos(menuContraparte);
              setMenuAnchor(null);
            }}
          >
            <ListItemIcon>
              <FileText size={16} strokeWidth={1.5} />
            </ListItemIcon>
            <ListItemText>Documentos (facturas/pagos)</ListItemText>
          </MenuItem>,
          <MenuItem
            key="relaciones"
            onClick={() => {
              abrirRelaciones(menuContraparte);
              setMenuAnchor(null);
            }}
          >
            <ListItemIcon>
              <Shield size={16} strokeWidth={1.5} />
            </ListItemIcon>
            <ListItemText>Relaciones (PLD)</ListItemText>
          </MenuItem>,
          <MenuItem
            key="borrar"
            disabled={!puedeEditar}
            onClick={() => {
              handleBorrar(menuContraparte);
              setMenuAnchor(null);
            }}
          >
            <ListItemIcon>
              <Trash2 size={16} strokeWidth={1.5} />
            </ListItemIcon>
            <ListItemText>Borrar</ListItemText>
          </MenuItem>,
        ]}
      </Menu>

      <Dialog open={dialogOpen} onClose={() => setDialogOpen(false)} fullWidth maxWidth="sm">
        <DialogTitle sx={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          {soloLectura ? `Ver ${editing?.razon_social}` : editing ? `Editar ${editing.razon_social}` : "Nueva Contraparte"}
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
          {/* fieldset disabled deshabilita en cascada los <input>/<textarea>
          reales de TextField y Checkbox (28/Ago/2026, modo "Ver") - los
          Select de MUI no son elementos de formulario nativos, asi que esos
          3 llevan su propio disabled={soloLectura} explicito mas abajo. */}
          <Stack
            component="fieldset"
            disabled={soloLectura}
            spacing={2}
            sx={{ border: 0, margin: 0, padding: 0, minWidth: 0 }}
          >
            {/* Campos de solo lectura - generados por el sistema, se
            muestran siempre (incluso al crear) para que se vea que existen
            aunque todavia no tengan valor. */}
            <Stack direction={{ xs: "column", sm: "row" }} spacing={2}>
              <TextField
                size="small"
                label="ID contraparte"
                value={editing ? editing.id_contraparte : idNuevo}
                disabled
                fullWidth
              />
              {editing && (
                <TextField
                  size="small"
                  label="Creado por"
                  value={(editing.created_by && emailPorUserId[editing.created_by]) || editing.created_by || "—"}
                  disabled
                  fullWidth
                />
              )}
            </Stack>
            {/* autorizado_por (28/Ago/2026, campo del ERD sin UI hasta
            ahora, pedido explicito de Mariana: va justo debajo del ID
            contraparte) - se elige de los colaboradores internos ("se
            usara de los colaboradores internos") - guarda el user_id, no
            un nombre libre, para que quede ligado a un usuario real de
            iam-service. `permiso` se quito del formulario (28/Ago/2026,
            confirmado con Mariana) - campo heredado del AppSheet original
            sin ninguna funcion real en el sistema hoy, generaba confusion
            sin proposito claro. Sigue existiendo en el modelo/API por si
            en el futuro se le da un uso real. */}
            <FormControl size="small" fullWidth>
              <InputLabel id="autorizado-por-label">Autorizado por</InputLabel>
              <Select
                labelId="autorizado-por-label"
                label="Autorizado por"
                value={form.autorizadoPor}
                onChange={(e) => setForm({ ...form, autorizadoPor: e.target.value })}
                disabled={soloLectura}
              >
                <MenuItem value="">
                  <em>Sin especificar</em>
                </MenuItem>
                {colaboradores.map((u) => (
                  <MenuItem key={u.user_id} value={u.user_id}>
                    {u.primary_email}
                  </MenuItem>
                ))}
              </Select>
            </FormControl>
            {editing && (
              <Stack direction={{ xs: "column", sm: "row" }} spacing={2}>
                <TextField
                  size="small"
                  label="Creado el"
                  value={new Date(editing.created_at).toLocaleString("es-MX")}
                  disabled
                  fullWidth
                />
                <TextField
                  size="small"
                  label="Última actualización"
                  value={new Date(editing.updated_at).toLocaleString("es-MX")}
                  disabled
                  fullWidth
                />
              </Stack>
            )}
            {/* Datos personales (02/Sep/2026, formulario reorganizado en
            secciones - antes era una sola lista plana de campos sin
            agrupar). El campo sigue guardándose en razon_social (misma
            columna del ERD, la que usan Contrato/Factura/etc.) en los dos
            casos, pero el LABEL cambia segun el tipo de persona (pedido
            explicito: "en persona fisica, no pongas razon social sino
            nombre") - para Fisica/Fisica con actividad empresarial es
            SOLO el/los nombre(s) de pila (sin apellidos, esos van en sus
            propios campos abajo); para Moral/Fideicomiso sigue siendo la
            razon social real. */}
            <Typography variant="overline" color="text.secondary">
              Datos personales
            </Typography>
            {/* Tipo de persona sube antes del Nombre/Razón social
            (02/Sep/2026, pedido explicito) - el label del campo de abajo
            depende de este valor, tiene mas sentido elegirlo primero. */}
            <FormControl size="small" fullWidth required>
              <InputLabel id="tipo-persona-label">Tipo de persona</InputLabel>
              <Select
                labelId="tipo-persona-label"
                label="Tipo de persona"
                value={form.tipoPersona}
                onChange={(e) => {
                  const tipoPersona = e.target.value as TesoreriaTipoPersona | "";
                  const esFisica = tipoPersona === "fisica" || tipoPersona === "fisica_act_emp";
                  setForm({
                    ...form,
                    tipoPersona,
                    // Limpia apellidos/genero al cambiar a Moral/Fideicomiso -
                    // no tiene sentido guardar datos de persona fisica para
                    // una razon social. Si el checkbox "mismo titular" sigue
                    // marcado, el contacto se recalcula aqui tambien (los
                    // apellidos que se acaban de vaciar).
                    ...(esFisica
                      ? {}
                      : { apellidoPaterno: "", apellidoMaterno: "", genero: "" }),
                    ...(contactoMismoTitular
                      ? {
                          contacto: nombreCompletoFisica(
                            form.razonSocial,
                            esFisica ? form.apellidoPaterno : "",
                            esFisica ? form.apellidoMaterno : ""
                          ),
                        }
                      : {}),
                  });
                }}
                disabled={soloLectura}
              >
                {Object.entries(TIPO_PERSONA_LABELS).map(([value, label]) => (
                  <MenuItem key={value} value={value}>
                    {label}
                  </MenuItem>
                ))}
              </Select>
            </FormControl>
            <TextField
              size="small"
              label={esPersonaFisica ? "Nombre" : "Razón social"}
              value={form.razonSocial}
              onChange={(e) => {
                const razonSocial = e.target.value;
                // "Contacto" solo se sincroniza si el usuario marco a
                // proposito el checkbox "El contacto es el mismo titular"
                // (ver handleToggleContactoMismoTitular) - nunca por
                // default, son dos datos legales distintos.
                const contactoAuto = contactoMismoTitular
                  ? { contacto: nombreCompletoFisica(razonSocial, form.apellidoPaterno, form.apellidoMaterno) }
                  : {};
                setForm({ ...form, razonSocial, ...contactoAuto });
              }}
              fullWidth
            />
            {esPersonaFisica && (
              <>
                <Stack direction={{ xs: "column", sm: "row" }} spacing={2}>
                  <TextField
                    size="small"
                    label="Apellido paterno"
                    value={form.apellidoPaterno}
                    onChange={(e) => {
                      const apellidoPaterno = e.target.value;
                      const contactoAuto = contactoMismoTitular
                        ? { contacto: nombreCompletoFisica(form.razonSocial, apellidoPaterno, form.apellidoMaterno) }
                        : {};
                      setForm({ ...form, apellidoPaterno, ...contactoAuto });
                    }}
                    fullWidth
                  />
                  <TextField
                    size="small"
                    label="Apellido materno"
                    value={form.apellidoMaterno}
                    onChange={(e) => {
                      const apellidoMaterno = e.target.value;
                      const contactoAuto = contactoMismoTitular
                        ? { contacto: nombreCompletoFisica(form.razonSocial, form.apellidoPaterno, apellidoMaterno) }
                        : {};
                      setForm({ ...form, apellidoMaterno, ...contactoAuto });
                    }}
                    fullWidth
                  />
                </Stack>
                <FormControl size="small" fullWidth>
                  <InputLabel id="genero-label">Género</InputLabel>
                  <Select
                    labelId="genero-label"
                    label="Género"
                    value={form.genero}
                    onChange={(e) => setForm({ ...form, genero: e.target.value as "MUJER" | "HOMBRE" | "X" | "" })}
                    disabled={soloLectura}
                  >
                    <MenuItem value="MUJER">Mujer</MenuItem>
                    <MenuItem value="HOMBRE">Hombre</MenuItem>
                    {/* X (02/Sep/2026) - la posicion 15 de una CURP real solo
                    puede ser H, M o X (RENAPO); faltaba esta tercera opcion
                    para poder derivar el genero automaticamente de una CURP
                    sin dejar casos sin representar. Label "No binario"
                    (pedido explicito) - el VALOR que se guarda sigue siendo
                    "X" (coincide con la letra real de la CURP). */}
                    <MenuItem value="X">No binario</MenuItem>
                  </Select>
                </FormControl>
              </>
            )}

            <Divider />
            <Typography variant="overline" color="text.secondary">
              Datos fiscales
            </Typography>
            <TextField
              size="small"
              label="RFC"
              value={form.rfc}
              onChange={(e) => setForm({ ...form, rfc: e.target.value })}
              fullWidth
            />
            <Stack direction="row" spacing={2}>
              <FormControlLabel
                control={
                  <Checkbox
                    checked={form.cliente}
                    onChange={(e) => setForm({ ...form, cliente: e.target.checked })}
                  />
                }
                label="Cliente"
              />
              <FormControlLabel
                control={
                  <Checkbox
                    checked={form.proveedor}
                    onChange={(e) => setForm({ ...form, proveedor: e.target.checked })}
                  />
                }
                label="Proveedor"
              />
            </Stack>

            <Divider />
            <Typography variant="overline" color="text.secondary">
              Contacto
            </Typography>
            <TextField
              size="small"
              label="Correo"
              required
              value={form.email}
              onChange={(e) => setForm({ ...form, email: e.target.value })}
              fullWidth
            />
            {esPersonaFisica && (
              <FormControlLabel
                control={
                  <Checkbox
                    checked={contactoMismoTitular}
                    onChange={(e) => handleToggleContactoMismoTitular(e.target.checked)}
                  />
                }
                // El Contacto (dato de correspondencia, Art. 34 Codigo
                // Civil Federal) puede ser distinto del Titular (que debe
                // llevar sus datos reales por la LFPDPPP) - este checkbox
                // es la unica forma de copiarlo, nunca automatico.
                label="El contacto es el mismo titular"
              />
            )}
            <TextField
              size="small"
              label="Nombre del contacto"
              value={form.contacto}
              onChange={(e) => setForm({ ...form, contacto: e.target.value })}
              disabled={soloLectura || contactoMismoTitular}
              helperText={contactoMismoTitular ? "Copiado del titular - desmarca la casilla para editarlo" : undefined}
              fullWidth
            />
            <TextField
              size="small"
              label="Teléfono / SMS"
              value={form.telefonoSms}
              onChange={(e) => setForm({ ...form, telefonoSms: e.target.value })}
              fullWidth
            />

            <Divider />
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
          <Button onClick={() => setDialogOpen(false)}>{soloLectura ? "Cerrar" : "Cancelar"}</Button>
          {!soloLectura && (
            <Button variant="contained" onClick={handleGuardar} disabled={saving}>
              {saving ? <CircularProgress size={16} /> : "Guardar"}
            </Button>
          )}
        </DialogActions>
      </Dialog>

      {/* Relaciones (rep. legal / benef. controlador) de una contraparte */}
      <Dialog open={!!relacionesContraparte} onClose={() => setRelacionesContraparte(null)} fullWidth maxWidth="sm">
        <DialogTitle sx={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          Relaciones — {relacionesContraparte?.razon_social}
          <IconButton onClick={() => setRelacionesContraparte(null)} size="small" aria-label="Cerrar">
            <CloseIcon size={18} strokeWidth={1.5} />
          </IconButton>
        </DialogTitle>
        <DialogContent dividers>
          <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
            Representante legal / beneficiario controlador — dato requerido por PLD/AML.
          </Typography>
          {puedeCrear && !relacionFormOpen && (
            <Button
              size="small"
              variant="contained"
              startIcon={<Plus size={14} strokeWidth={2} />}
              onClick={() => {
                setIdRelacionNueva(generarIdCorto());
                setRelacionFormOpen(true);
              }}
              sx={{ mb: 2 }}
            >
              Nueva Relación
            </Button>
          )}
          {relacionFormOpen && (
            <Stack spacing={2} sx={{ mb: 2, p: 2, border: "1px solid", borderColor: "divider", borderRadius: 1 }}>
              {relacionFormError && <Alert severity="error">{relacionFormError}</Alert>}
              <TextField size="small" label="ID" value={idRelacionNueva} disabled fullWidth />
              <FormControl size="small" fullWidth>
                <InputLabel id="relacion-contraparte-label">Persona relacionada</InputLabel>
                <Select
                  labelId="relacion-contraparte-label"
                  label="Persona relacionada"
                  value={relacionForm.contraparteRelacion}
                  onChange={(e) => setRelacionForm({ ...relacionForm, contraparteRelacion: e.target.value })}
                >
                  {contrapartes
                    .filter((c) => c.id_contraparte !== relacionesContraparte?.id_contraparte)
                    .map((c) => (
                      <MenuItem key={c.id_contraparte} value={c.id_contraparte}>
                        {c.razon_social}
                      </MenuItem>
                    ))}
                </Select>
              </FormControl>
              <FormControl size="small" fullWidth>
                <InputLabel id="relacion-tipo-label">Tipo de relación</InputLabel>
                <Select
                  labelId="relacion-tipo-label"
                  label="Tipo de relación"
                  value={relacionForm.tipoRelacion}
                  onChange={(e) => setRelacionForm({ ...relacionForm, tipoRelacion: e.target.value as TesoreriaTipoRelacion })}
                >
                  {Object.entries(TIPO_RELACION_LABELS).map(([value, label]) => (
                    <MenuItem key={value} value={value}>
                      {label}
                    </MenuItem>
                  ))}
                </Select>
              </FormControl>
              <Stack direction="row" spacing={1} justifyContent="flex-end">
                <Button size="small" onClick={() => setRelacionFormOpen(false)}>
                  Cancelar
                </Button>
                <Button size="small" variant="contained" onClick={handleGuardarRelacion} disabled={savingRelacion}>
                  {savingRelacion ? <CircularProgress size={16} /> : "Guardar"}
                </Button>
              </Stack>
            </Stack>
          )}
          <TableContainer>
            <Table size="small">
              <TableHead>
                <TableRow>
                  <TableCell>Persona</TableCell>
                  <TableCell>Tipo</TableCell>
                  <TableCell align="right">Acciones</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {loadingRelaciones ? (
                  <TableRow>
                    <TableCell colSpan={3} align="center" sx={{ py: 3 }}>
                      <CircularProgress size={20} />
                    </TableCell>
                  </TableRow>
                ) : relaciones.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={3} align="center" sx={{ py: 3 }}>
                      <Typography variant="body2" color="text.secondary">
                        Sin relaciones registradas.
                      </Typography>
                    </TableCell>
                  </TableRow>
                ) : (
                  relaciones.map((r) => (
                    <TableRow key={r.id_relacion} hover>
                      <TableCell>{r.contraparte_relacion_nombre}</TableCell>
                      <TableCell>{TIPO_RELACION_LABELS[r.tipo_relacion] ?? r.tipo_relacion}</TableCell>
                      <TableCell align="right">
                        <IconButton size="small" aria-label="Borrar" onClick={() => handleBorrarRelacion(r)} disabled={!puedeEditar}>
                          <Trash2 size={14} strokeWidth={1.5} />
                        </IconButton>
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </TableContainer>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setRelacionesContraparte(null)}>Cerrar</Button>
        </DialogActions>
      </Dialog>

      {/* Contratos de una contraparte (1:N, 28/Ago/2026) - solo lectura, el
      alta/edicion vive exclusivamente en /tesoreria/contratos (pedido
      explicito de Mariana: "quita lo de contrapartes, nuevo contrato").
      Cada renglon linkea a su contrato; el boton del pie linkea a la lista
      completa ya filtrada por esta contraparte. */}
      <Dialog open={!!contratosContraparte} onClose={() => setContratosContraparte(null)} fullWidth maxWidth="sm">
        <DialogTitle sx={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          Contratos — {contratosContraparte?.razon_social}
          <IconButton onClick={() => setContratosContraparte(null)} size="small" aria-label="Cerrar">
            <CloseIcon size={18} strokeWidth={1.5} />
          </IconButton>
        </DialogTitle>
        <DialogContent dividers>
          <TableContainer>
            <Table size="small">
              <TableHead>
                <TableRow>
                  <TableCell>ID de contrato</TableCell>
                  <TableCell>Sociedad</TableCell>
                  <TableCell>Tipo</TableCell>
                  <TableCell>Estado</TableCell>
                  <TableCell align="right">Acciones</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {loadingContratos ? (
                  <TableRow>
                    <TableCell colSpan={5} align="center" sx={{ py: 3 }}>
                      <CircularProgress size={20} />
                    </TableCell>
                  </TableRow>
                ) : contratos.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={5} align="center" sx={{ py: 3 }}>
                      <Typography variant="body2" color="text.secondary">
                        Sin contratos registrados para esta contraparte.
                      </Typography>
                    </TableCell>
                  </TableRow>
                ) : (
                  contratos.map((c) => (
                    <TableRow key={c.id_contrato} hover>
                      <TableCell sx={{ fontFamily: "var(--font-mono, monospace)" }}>{c.id_contrato}</TableCell>
                      <TableCell>{nombreSociedad(c.sociedad)}</TableCell>
                      <TableCell>{c.tipo || "—"}</TableCell>
                      <TableCell>{c.status || "—"}</TableCell>
                      <TableCell align="right">
                        <IconButton
                          size="small"
                          aria-label="Ir a este contrato"
                          href={`/tesoreria/contratos?id_contrato=${encodeURIComponent(c.id_contrato)}`}
                        >
                          <ExternalLink size={14} strokeWidth={1.5} />
                        </IconButton>
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </TableContainer>
        </DialogContent>
        <DialogActions>
          {/* Filtrado por esta contraparte, no la lista completa (28/Ago/2026,
          pedido explicito de Mariana: "se te redirige a los contratos solo
          pertenecientes a esa contraparte, no se mostraran lo de otra
          contraparte") - ver soporte de ?contraparte= en contratos/page.tsx. */}
          <Button
            href={`/tesoreria/contratos?contraparte=${encodeURIComponent(contratosContraparte?.id_contraparte ?? "")}`}
          >
            Ir a Contratos
          </Button>
          <Button onClick={() => setContratosContraparte(null)}>Cerrar</Button>
        </DialogActions>
      </Dialog>

      {/* Documentos (vista por proveedor) - facturas/complementos/notas de
      credito ligados via el FK contraparte (auto por RFC). Solo lectura -
      cada una se sigue editando desde su propia pantalla. */}
      <Dialog open={!!documentosContraparte} onClose={() => setDocumentosContraparte(null)} fullWidth maxWidth="md">
        <DialogTitle sx={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          Documentos — {documentosContraparte?.razon_social}
          <IconButton onClick={() => setDocumentosContraparte(null)} size="small" aria-label="Cerrar">
            <CloseIcon size={18} strokeWidth={1.5} />
          </IconButton>
        </DialogTitle>
        <DialogContent dividers>
          {loadingDocumentos ? (
            <Stack alignItems="center" sx={{ py: 3 }}>
              <CircularProgress size={20} />
            </Stack>
          ) : (
            <Stack spacing={3}>
              <Stack spacing={1}>
                <Typography variant="subtitle2">Facturas ({docFacturas.length})</Typography>
                {docFacturas.length === 0 ? (
                  <Typography variant="body2" color="text.secondary">
                    Sin facturas ligadas a esta contraparte.
                  </Typography>
                ) : (
                  <TableContainer>
                    <Table size="small">
                      <TableHead>
                        <TableRow>
                          <TableCell>Folio</TableCell>
                          <TableCell>Fecha</TableCell>
                          <TableCell align="right">Total</TableCell>
                          <TableCell>Estado</TableCell>
                        </TableRow>
                      </TableHead>
                      <TableBody>
                        {docFacturas.map((f) => (
                          <TableRow key={f.id} hover>
                            <TableCell sx={{ fontFamily: "var(--font-mono, monospace)" }}>
                              {f.comprobante_serie || ""}
                              {f.comprobante_folio || f.timbre_uuid}
                            </TableCell>
                            <TableCell>{f.comprobante_fecha ? f.comprobante_fecha.slice(0, 10) : "—"}</TableCell>
                            <TableCell align="right">{f.comprobante_total || "—"}</TableCell>
                            <TableCell>{f.estado || "—"}</TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </TableContainer>
                )}
              </Stack>

              <Stack spacing={1}>
                <Typography variant="subtitle2">Complementos de Pago ({docComplementos.length})</Typography>
                {docComplementos.length === 0 ? (
                  <Typography variant="body2" color="text.secondary">
                    Sin complementos de pago ligados a esta contraparte.
                  </Typography>
                ) : (
                  <TableContainer>
                    <Table size="small">
                      <TableHead>
                        <TableRow>
                          <TableCell>Folio</TableCell>
                          <TableCell>Fecha de pago</TableCell>
                          <TableCell align="right">Monto pagado</TableCell>
                        </TableRow>
                      </TableHead>
                      <TableBody>
                        {docComplementos.map((c) => (
                          <TableRow key={c.id} hover>
                            <TableCell sx={{ fontFamily: "var(--font-mono, monospace)" }}>
                              {c.serie || ""}
                              {c.folio || c.timbre_uuid}
                            </TableCell>
                            <TableCell>{c.fecha_de_pago || "—"}</TableCell>
                            <TableCell align="right">{c.monto_pagado || "—"}</TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </TableContainer>
                )}
              </Stack>

              <Stack spacing={1}>
                <Typography variant="subtitle2">Notas de Crédito ({docNotasCredito.length})</Typography>
                {docNotasCredito.length === 0 ? (
                  <Typography variant="body2" color="text.secondary">
                    Sin notas de crédito ligadas a esta contraparte.
                  </Typography>
                ) : (
                  <TableContainer>
                    <Table size="small">
                      <TableHead>
                        <TableRow>
                          <TableCell>Folio</TableCell>
                          <TableCell>Factura relacionada</TableCell>
                          <TableCell align="right">Total</TableCell>
                        </TableRow>
                      </TableHead>
                      <TableBody>
                        {docNotasCredito.map((n) => (
                          <TableRow key={n.id} hover>
                            <TableCell sx={{ fontFamily: "var(--font-mono, monospace)" }}>
                              {n.comprobante_serie || ""}
                              {n.comprobante_folio || n.timbre_uuid}
                            </TableCell>
                            <TableCell>{n.factura_folio || "—"}</TableCell>
                            <TableCell align="right">{n.comprobante_total || "—"}</TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </TableContainer>
                )}
              </Stack>
            </Stack>
          )}
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setDocumentosContraparte(null)}>Cerrar</Button>
        </DialogActions>
      </Dialog>

      <Dialog open={!!borrando} onClose={() => (borrandoLoading ? undefined : setBorrando(null))} fullWidth maxWidth="xs">
        <DialogTitle>Borrar contraparte</DialogTitle>
        <DialogContent>
          <Typography>
            ¿Borrar la contraparte {borrando?.razon_social}? Esta acción no se puede deshacer.
          </Typography>
          {borrandoError && (
            <Alert severity="error" sx={{ mt: 2 }}>
              {borrandoError}
            </Alert>
          )}
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setBorrando(null)} disabled={borrandoLoading}>
            Cancelar
          </Button>
          <Button onClick={confirmarBorrar} color="error" variant="contained" disabled={borrandoLoading}>
            {borrandoLoading ? "Borrando…" : "Borrar"}
          </Button>
        </DialogActions>
      </Dialog>
    </AppShell>
  );
}
