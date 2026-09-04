"use client";

import { useEffect, useState } from "react";
import {
  Alert,
  Button,
  Chip,
  CircularProgress,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  FormControl,
  InputAdornment,
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
  Typography,
} from "@mui/material";
import { FilePlus2, FolderOpen, Search } from "lucide-react";
import AppShell from "@/components/AppShell";
import ContraparteSelector from "@/components/ContraparteSelector";
import { BRAND } from "@/theme/theme";
import { SessionUser, getSession } from "@/lib/auth";
import { GeneralSociedad, listSociedades } from "@/lib/iam";
import {
  CATEGORIA_CUMPLIMIENTO_LABELS,
  PldCategoriaCumplimiento,
  PldContraparteKyc,
  PldDatosEditables,
  createKyc,
  listKyc,
  nombreParaMostrar,
} from "@/lib/pld";
import { TesoreriaContraparte } from "@/lib/tesoreria";

const ESTADO_OPTIONS = [
  { value: "PENDIENTE", label: "Pendiente" },
  { value: "INCOMPLETO", label: "Incompleto" },
  { value: "ENTREGADO", label: "Entregado" },
] as const;

const ESTADO_COLOR: Record<string, "default" | "warning" | "info" | "success"> = {
  PENDIENTE: "default",
  INCOMPLETO: "warning",
  ENTREGADO: "info",
};

function TablaExpedientes({ session }: { session: SessionUser | null }) {
  // Mismo criterio que PldContraparteKycViewSet.get_permissions
  // (crear=pld-compliance.crear, editar=pld-compliance.editar,
  // aprobar=pld-compliance.aprobar - segregacion de funciones a
  // proposito, PLD_ANALISTA no puede aprobar su propio trabajo).
  const puedeCrear = session?.perm_keys.includes("pld-compliance.crear") ?? false;
  const [expedientes, setExpedientes] = useState<(PldContraparteKyc & PldDatosEditables)[]>([]);
  const [search, setSearch] = useState("");
  const [estadoLlenado, setEstadoLlenado] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Nuevo expediente (17/Ago/2026, Opcion B; 19/Ago/2026 - conectado al
  // catalogo real de contrapartes): sociedad sigue opcional, pero la
  // contraparte ya no se autogenera con un ID propio - el analista busca
  // el cliente/proveedor real en Tesoreria (o lo crea ahi mismo con solo
  // el nombre) y el expediente adopta ESE id_contraparte desde el dia 1.
  // Ver docs/architecture/README.md sec. 11.2 #7, "contraparte maestra
  // unica".
  const [dialogoAbierto, setDialogoAbierto] = useState(false);
  const [tipoContraparte, setTipoContraparte] = useState<"cliente" | "proveedor">("cliente");
  const [contraparte, setContraparte] = useState<TesoreriaContraparte | null>(null);
  const [sociedadRfc, setSociedadRfc] = useState("");
  // 31/Ago/2026 (pedido de Mariana: "hay que hacer ese filtro por
  // sociedad y proyecto" - caso real de un colaborador externo acotado a
  // un solo proyecto) - opcional, a diferencia de sociedadRfc; sin
  // catalogo real de Proyecto todavia (texto libre, mismo criterio que
  // /tesoreria/contratos).
  const [proyecto, setProyecto] = useState("");
  const [creando, setCreando] = useState(false);
  const [creandoError, setCreandoError] = useState<string | null>(null);

  // Catalogo real de sociedades (25/Ago/2026, requerimiento real del
  // cliente: "hay que implementar sociedad... se ponga en automatico el
  // nombre") - antes era un TextField de RFC libre (opcional, y de hecho
  // nunca funcionaba, ver pld-service/pld/serializers.py); ahora es
  // obligatorio y se elige de este dropdown contra iam-service.
  const [sociedades, setSociedades] = useState<GeneralSociedad[]>([]);
  useEffect(() => {
    listSociedades()
      .then(setSociedades)
      .catch(() => setSociedades([]));
  }, []);

  // 31/Ago/2026 (pedido de Mariana: "en el filtro de sociedades solo
  // deben aparecer las activas para ese rol - en global o super admin asi
  // esta bien") - el filtro de la lista (a diferencia del selector del
  // dialogo "Nuevo Expediente", que se queda con el catalogo completo)
  // solo debe ofrecer sociedades a las que el usuario de verdad tiene
  // acceso. GLOBAL sigue viendo el catalogo entero.
  const sociedadesDelFiltro =
    session?.is_global || !session ? sociedades : sociedades.filter((s) => session.sociedad_rfcs.includes(s.rfc));

  // 31/Ago/2026 (pedido de Mariana: "de ahi debe tener filtro para poder
  // ver unicamente los de una sociedad o la otra") - un analista con
  // acceso a varias sociedades (union real del scope) las ve todas
  // mezcladas por default; este filtro acota la vista sin cambiar el
  // alcance real de la sesion.
  const [filtroSociedad, setFiltroSociedad] = useState("");

  // Tabs KYC/KYB (04/Sep/2026, pedido de Mariana: "en pld hay que tener
  // tabs de KYC y KYB") - "" = todos, mismo criterio de filtro server-side
  // que estado/sociedad de arriba (categoria_cumplimiento en get_queryset).
  const [tabCategoria, setTabCategoria] = useState<PldCategoriaCumplimiento | "">("");

  function cargar() {
    setLoading(true);
    setError(null);
    listKyc({
      estadoLlenado: estadoLlenado || undefined,
      search: search || undefined,
      sociedadRfc: filtroSociedad || undefined,
      categoriaCumplimiento: tabCategoria || undefined,
    })
      .then(setExpedientes)
      .catch((err) => setError(err instanceof Error ? err.message : "Error desconocido"))
      .finally(() => setLoading(false));
  }

  useEffect(() => {
    const timeout = setTimeout(cargar, 300);
    return () => clearTimeout(timeout);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [search, estadoLlenado, filtroSociedad, tabCategoria]);

  // Aprobar/reactivar se movieron a la vista de detalle (/pld/[idKyc],
  // 17/Ago/2026) - la lista ya solo tiene "Ver", igual que se acordo con
  // Mariana.

  async function handleCrearExpediente(e: React.FormEvent) {
    e.preventDefault();
    if (!session?.user_id) return;
    if (!contraparte) {
      setCreandoError("Busca o crea la contraparte antes de continuar.");
      return;
    }
    if (!sociedadRfc) {
      setCreandoError("Elige la sociedad antes de continuar.");
      return;
    }
    setCreando(true);
    setCreandoError(null);
    try {
      await createKyc({
        createdBy: session.user_id,
        sociedadRfc,
        proyecto: proyecto || undefined,
        idContraparte: contraparte.id_contraparte,
      });
      setDialogoAbierto(false);
      setContraparte(null);
      setSociedadRfc("");
      setProyecto("");
      cargar();
    } catch (err) {
      setCreandoError(err instanceof Error ? err.message : "Error al crear el expediente.");
    } finally {
      setCreando(false);
    }
  }

  return (
    <Paper variant="outlined" sx={{ p: 3 }}>
      <Stack direction="row" spacing={1.5} alignItems="center" justifyContent="space-between" sx={{ mb: 2 }}>
        <Stack direction="row" spacing={1.5} alignItems="center">
          <FolderOpen size={22} strokeWidth={1.5} color={BRAND.azul} />
          <Typography variant="subtitle1" fontWeight={600}>
            Expedientes KYC
          </Typography>
        </Stack>
        {puedeCrear && (
          <Button
            size="small"
            variant="contained"
            startIcon={<FilePlus2 size={16} strokeWidth={1.5} />}
            onClick={() => {
              setTipoContraparte("cliente");
              setContraparte(null);
              setDialogoAbierto(true);
            }}
          >
            Nuevo Expediente
          </Button>
        )}
      </Stack>

      <Dialog
        open={dialogoAbierto}
        onClose={() => {
          setDialogoAbierto(false);
          setContraparte(null);
        }}
        fullWidth
        maxWidth="xs"
      >
        <DialogTitle>Nuevo Expediente KYC</DialogTitle>
        <Stack component="form" onSubmit={handleCrearExpediente}>
          <DialogContent>
            <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
              Indica si es cliente o proveedor y búscalo en el catálogo de Tesorería — si no existe,
              créalo aquí mismo con solo el nombre. El resto de sus datos los llena él después, desde el
              link público que le mandes (Tickets de cliente).
            </Typography>
            <Stack spacing={2}>
              <FormControl size="small" fullWidth>
                <InputLabel id="tipo-contraparte-label">Es un...</InputLabel>
                <Select
                  labelId="tipo-contraparte-label"
                  label="Es un..."
                  value={tipoContraparte}
                  onChange={(e) => {
                    setTipoContraparte(e.target.value as "cliente" | "proveedor");
                    setContraparte(null);
                  }}
                >
                  <MenuItem value="cliente">Cliente</MenuItem>
                  <MenuItem value="proveedor">Proveedor</MenuItem>
                </Select>
              </FormControl>
              <ContraparteSelector
                value={contraparte}
                onChange={setContraparte}
                label={tipoContraparte === "cliente" ? "Cliente" : "Proveedor"}
                tipo={tipoContraparte}
              />
              <FormControl size="small" fullWidth required>
                <InputLabel id="sociedad-label">Sociedad</InputLabel>
                <Select
                  labelId="sociedad-label"
                  label="Sociedad"
                  value={sociedadRfc}
                  onChange={(e) => setSociedadRfc(e.target.value)}
                >
                  {sociedades.map((sociedad) => (
                    <MenuItem key={sociedad.rfc} value={sociedad.rfc}>
                      {sociedad.razon_social || sociedad.rfc}
                    </MenuItem>
                  ))}
                </Select>
              </FormControl>
              <TextField
                size="small"
                fullWidth
                label="Proyecto (opcional)"
                helperText="Solo si este expediente pertenece a un proyecto específico — ej. para acotar el acceso de un colaborador externo."
                value={proyecto}
                onChange={(e) => setProyecto(e.target.value)}
              />
            </Stack>
            {creandoError && (
              <Alert severity="error" sx={{ mt: 2 }}>
                {creandoError}
              </Alert>
            )}
          </DialogContent>
          <DialogActions>
            <Button onClick={() => setDialogoAbierto(false)}>Cancelar</Button>
            <Button type="submit" variant="contained" disabled={creando || !contraparte || !sociedadRfc}>
              {creando ? <CircularProgress size={20} color="inherit" /> : "Crear expediente"}
            </Button>
          </DialogActions>
        </Stack>
      </Dialog>

      <Tabs
        value={tabCategoria}
        onChange={(_, valor) => setTabCategoria(valor)}
        sx={{ mb: 2, borderBottom: 1, borderColor: "divider" }}
      >
        <Tab value="" label="Todos" />
        <Tab value="KYC" label={CATEGORIA_CUMPLIMIENTO_LABELS.KYC} />
        <Tab value="KYB" label={CATEGORIA_CUMPLIMIENTO_LABELS.KYB} />
        <Tab value="PENDIENTE_REVISION" label={CATEGORIA_CUMPLIMIENTO_LABELS.PENDIENTE_REVISION} />
      </Tabs>

      <Stack direction={{ xs: "column", sm: "row" }} spacing={2} sx={{ mb: 3 }} flexWrap="wrap" useFlexGap>
        <TextField
          size="small"
          placeholder="Buscar por contraparte o CURP..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          sx={{ flex: 1, maxWidth: 300 }}
          InputProps={{
            startAdornment: (
              <InputAdornment position="start">
                <Search size={16} strokeWidth={1.5} />
              </InputAdornment>
            ),
          }}
        />
        <FormControl size="small" sx={{ minWidth: 180 }}>
          <InputLabel id="estado-filter-label">Estado</InputLabel>
          <Select
            labelId="estado-filter-label"
            label="Estado"
            value={estadoLlenado}
            onChange={(e) => setEstadoLlenado(e.target.value)}
          >
            <MenuItem value="">Todos</MenuItem>
            {ESTADO_OPTIONS.map((o) => (
              <MenuItem key={o.value} value={o.value}>
                {o.label}
              </MenuItem>
            ))}
          </Select>
        </FormControl>
        <FormControl size="small" sx={{ minWidth: 200 }}>
          <InputLabel id="sociedad-filter-label">Sociedad</InputLabel>
          <Select
            labelId="sociedad-filter-label"
            label="Sociedad"
            value={filtroSociedad}
            onChange={(e) => setFiltroSociedad(e.target.value)}
          >
            <MenuItem value="">Todas</MenuItem>
            {sociedadesDelFiltro.map((sociedad) => (
              <MenuItem key={sociedad.rfc} value={sociedad.rfc}>
                {sociedad.razon_social || sociedad.rfc}
              </MenuItem>
            ))}
          </Select>
        </FormControl>
      </Stack>

      {error && (
        <Alert severity="error" sx={{ mb: 2 }}>
          {error}
        </Alert>
      )}

      <TableContainer>
        <Table size="small">
          <TableHead>
            <TableRow>
              <TableCell>Contraparte</TableCell>
              <TableCell>Nombre / Razón social</TableCell>
              <TableCell>CURP</TableCell>
              {/* Sociedad (02/Sep/2026, pedido explicito: mismo criterio que
              la columna "Sociedad" de Tesoreria/Contrapartes - "no veo en
              contraparte a que empresa esta 'asociada'") - a diferencia de
              Tesoreria, PLD SI tiene la sociedad como columna propia del
              expediente (sociedad_nombre, snapshot de sociedad_rfc al
              crear, ver models.py), no hay que derivarla de nada mas. */}
              <TableCell>Sociedad</TableCell>
              {/* Categoría (04/Sep/2026, decision de Mariana: "vamos a
              tener KYC y KYB") - se deriva sola de tipo_persona, ver
              PldContraparteKyc.save() en el backend. */}
              <TableCell>Categoría</TableCell>
              <TableCell>Estado</TableCell>
              <TableCell>Documentos</TableCell>
              <TableCell>Aprobación</TableCell>
              <TableCell>Creado</TableCell>
              <TableCell align="right">Acciones</TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {loading ? (
              <TableRow>
                <TableCell colSpan={10} align="center" sx={{ py: 4 }}>
                  <CircularProgress size={24} />
                </TableCell>
              </TableRow>
            ) : expedientes.length === 0 ? (
              <TableRow>
                <TableCell colSpan={10} align="center" sx={{ py: 4 }}>
                  <Typography variant="body2" color="text.secondary">
                    Sin expedientes todavía.
                  </Typography>
                </TableCell>
              </TableRow>
            ) : (
              expedientes.map((kyc) => (
                <TableRow key={kyc.id_kyc} hover>
                  <TableCell>{kyc.id_contraparte}</TableCell>
                  <TableCell>{nombreParaMostrar(kyc) || "—"}</TableCell>
                  <TableCell>{kyc.curp || "—"}</TableCell>
                  <TableCell>{kyc.sociedad_nombre || "—"}</TableCell>
                  <TableCell>
                    {kyc.categoria_cumplimiento ? (
                      <Chip
                        size="small"
                        variant={kyc.categoria_cumplimiento === "PENDIENTE_REVISION" ? "outlined" : "filled"}
                        color={kyc.categoria_cumplimiento === "PENDIENTE_REVISION" ? "warning" : "default"}
                        label={CATEGORIA_CUMPLIMIENTO_LABELS[kyc.categoria_cumplimiento]}
                      />
                    ) : (
                      "—"
                    )}
                  </TableCell>
                  <TableCell>
                    <Stack direction="row" spacing={0.5} alignItems="center" flexWrap="wrap" useFlexGap>
                      <Chip
                        size="small"
                        label={ESTADO_OPTIONS.find((o) => o.value === kyc.estado_llenado)?.label ?? kyc.estado_llenado}
                        color={ESTADO_COLOR[kyc.estado_llenado] ?? "default"}
                      />
                      {kyc.estado_llenado_manual && (
                        <Chip
                          size="small"
                          variant="outlined"
                          label="Manual"
                          title="El analista fijó este estado a mano - ya no se recalcula solo según los documentos."
                        />
                      )}
                    </Stack>
                  </TableCell>
                  <TableCell>
                    {kyc.documentos.length} documento{kyc.documentos.length === 1 ? "" : "s"}
                  </TableCell>
                  <TableCell>
                    {kyc.aprobado_en ? (
                      <Chip size="small" color="success" label={`Aprobado (${kyc.aprobado_por})`} />
                    ) : (
                      <Typography variant="caption" color="text.secondary">
                        Sin aprobar
                      </Typography>
                    )}
                  </TableCell>
                  <TableCell>{new Date(kyc.created_at).toLocaleDateString("es-MX")}</TableCell>
                  <TableCell align="right">
                    <Button size="small" variant="text" href={`/pld/${kyc.id_kyc}`}>
                      Ver
                    </Button>
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </TableContainer>
    </Paper>
  );
}

// PLD / Cumplimiento (Fase 2, Semana 7-10; docs/architecture/README.md
// sec. 2). La tabla de expedientes ya esta conectada a pld-service
// (PldContraparteKycViewSet) - reemplaza el placeholder "Sin expedientes
// todavía" de Fase 0. Sigue pendiente: workflow completo de estados,
// formularios publicos con reCAPTCHA/Drive, y auditoria especifica del
// Motor Documental dentro de PLD (ver docs/CumbresBI_estado.md, Fase 2).
export default function PldPage() {
  const [session, setSession] = useState<SessionUser | null>(null);

  useEffect(() => {
    getSession().then(setSession);
  }, []);

  return (
    <AppShell>
      <Typography variant="h5" gutterBottom>
        PLD / Cumplimiento
      </Typography>
      <Typography variant="body2" color="text.secondary" sx={{ mb: 3 }}>
        Expedientes KYC y documentos. El Motor Documental se usa desde dentro de cada expediente
        (pestaña &quot;Documentos KYC&quot;), ya sin tener que volver a elegir a qué cliente pertenece.
      </Typography>

      <TablaExpedientes session={session} />
    </AppShell>
  );
}
