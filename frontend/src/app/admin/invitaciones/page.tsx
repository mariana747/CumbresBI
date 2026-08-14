"use client";

import { useEffect, useState } from "react";
import {
  Alert,
  Box,
  Button,
  Chip,
  CircularProgress,
  FormControl,
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
import { Copy, Link2, ShieldOff, UploadCloud, UserPlus } from "lucide-react";
import AppShell from "@/components/AppShell";
import { SessionUser, getSession } from "@/lib/auth";
import {
  IamExternalCollaborator,
  IamInvitation,
  IamMagicLink,
  IamMagicLinkMasivoError,
  createExternalCollaborator,
  createInvitation,
  createMagicLink,
  createMagicLinksMasivo,
  listExternalCollaborators,
  listInvitations,
  listMagicLinks,
  resendExternalCollaborator,
  revokeExternalCollaborator,
  revokeInvitation,
  revokeMagicLink,
} from "@/lib/iam";
import { listKyc } from "@/lib/pld";

// "Invitaciones" (unifica lo que antes eran dos pantallas separadas,
// Magic Links + IamInvitation - decision de producto 10/Ago/2026): dos
// mecanismos distintos que comparten el mismo concepto de "dejar entrar
// a alguien sin que ya sea parte de CumbresBI", solo que uno es temporal
// y sin cuenta de Workspace (Magic Link) y el otro es formal y con cuenta
// real (IamInvitation, gate de auth_views._upsert_identity).
export default function InvitacionesPage() {
  const [tab, setTab] = useState(0);
  const [session, setSession] = useState<SessionUser | null>(null);

  useEffect(() => {
    getSession().then(setSession);
  }, []);

  return (
    <AppShell>
      <Typography variant="h5" gutterBottom>
        Invitaciones
      </Typography>

      <Tabs value={tab} onChange={(_, v) => setTab(v)} sx={{ mb: 3 }}>
        <Tab icon={<Link2 size={16} strokeWidth={1.5} />} iconPosition="start" label="Temporales" />
        <Tab icon={<UserPlus size={16} strokeWidth={1.5} />} iconPosition="start" label="Colaboradores" />
        
      </Tabs>

      <Box role="tabpanel" hidden={tab !== 0}>
        {tab === 0 && <InvitacionesTemporalesTab session={session} />}
      </Box>
      <Box role="tabpanel" hidden={tab !== 1}>
        {tab === 1 && <ColaboradoresTab session={session} />}
      </Box>
    </AppShell>
  );
}

// --- Tab 1: Invitaciones temporales (antes /admin/magic-links, pestaña "Temporales" ahora) ---------

// Tipos de recurso que un Magic Link puede autorizar - lista cerrada a
// proposito (recurso_tipo es un string libre en el backend, pero mostrar un
// input libre en pantalla invita a valores inconsistentes/feos, ej.
// "PLD_KYC" vs "pld-kyc" vs "kyc"). Agregar un tipo nuevo aqui cuando otro
// modulo empiece a usar Magic Links (ver iam/models.py, IamMagicLink).
const RECURSO_TIPO_OPTIONS = [{ value: "pld_kyc", label: "Expediente KYC (PLD)" }] as const;

const ESTADO_LLENADO_LABELS: Record<string, string> = {
  PENDIENTE: "Pendiente",
  INCOMPLETO: "Incompleto",
  ENTREGADO: "Entregado",
};

// Magic Links (Fase 1, Semana 4) - modo dev. Sin envio de correo real
// todavia (ver iam/views.py) - por eso esta pantalla muestra el
// token/link generado directamente en lugar de solo "enviarlo". Cuando
// exista el envio real desde Workspace, esta pantalla deja de mostrar el
// token y solo confirma que se envio.
function InvitacionesTemporalesTab({ session }: { session: SessionUser | null }) {
  // Mismo criterio que el resto de escritura en iam-service - ver
  // IamMagicLinkViewSet.get_permissions (create/masivo=iam.crear,
  // revocar/reenviar=iam.editar).
  const puedeCrear = session?.perm_keys.includes("iam.crear") ?? false;
  const puedeEditar = session?.perm_keys.includes("iam.editar") ?? false;
  const [email, setEmail] = useState("");
  const [recursoTipo, setRecursoTipo] = useState("");
  const [recursoId, setRecursoId] = useState("");
  const [creando, setCreando] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [ultimoGenerado, setUltimoGenerado] = useState<IamMagicLink | null>(null);

  // Apodos de recurso_id por tipo, para no mostrar el id crudo (ej. "063dc27e")
  // ni en el selector ni en la tabla de abajo - ver recursoNombre(). Se
  // cachea por tipo (no se limpia al resetear el formulario tras generar)
  // para que la tabla conserve los apodos ya resueltos.
  const [catalogoRecursos, setCatalogoRecursos] = useState<Record<string, { value: string; label: string }[]>>({});
  const [cargandoRecursos, setCargandoRecursos] = useState(false);
  const recursoOpciones = catalogoRecursos[recursoTipo] ?? [];

  const [links, setLinks] = useState<IamMagicLink[]>([]);
  const [loading, setLoading] = useState(true);

  // Carga masiva por CSV (invitacion masiva, checklist Fase 1) - un correo
  // por linea/columna. Reusa el mismo catalogoRecursos ya precargado arriba
  // (pld_kyc), no necesita su propio efecto de carga.
  const [emailsMasivoTexto, setEmailsMasivoTexto] = useState("");
  const [recursoTipoMasivo, setRecursoTipoMasivo] = useState("");
  const [recursoIdMasivo, setRecursoIdMasivo] = useState("");
  const [cargandoMasivo, setCargandoMasivo] = useState(false);
  const [resultadoMasivo, setResultadoMasivo] = useState<{
    creados: IamMagicLink[];
    errores: IamMagicLinkMasivoError[];
  } | null>(null);
  const recursoOpcionesMasivo = catalogoRecursos[recursoTipoMasivo] ?? [];

  function refrescarLista() {
    setLoading(true);
    listMagicLinks()
      .then(setLinks)
      .catch((err) => setError(err instanceof Error ? err.message : "Error desconocido"))
      .finally(() => setLoading(false));
  }

  useEffect(() => {
    refrescarLista();
    // Precarga el catalogo de expedientes KYC para que la tabla de abajo
    // muestre apodos desde el primer render, sin esperar a que el usuario
    // abra el selector "Da acceso a" (ver recursoNombre()).
    listKyc()
      .then((expedientes) =>
        setCatalogoRecursos((prev) => ({
          ...prev,
          pld_kyc: expedientes.map((kyc) => ({
            value: kyc.id_kyc,
            label: `${kyc.id_contraparte}${kyc.curp ? ` · ${kyc.curp}` : ""} — ${
              ESTADO_LLENADO_LABELS[kyc.estado_llenado] ?? kyc.estado_llenado
            }`,
          })),
        }))
      )
      .catch(() => undefined);
  }, []);

  // Al elegir el tipo de recurso, se carga (una sola vez por tipo, ver
  // catalogoRecursos) el catalogo correspondiente para el segundo
  // selector, con un apodo legible en vez del id crudo.
  useEffect(() => {
    setRecursoId("");
    if (recursoTipo === "pld_kyc" && !catalogoRecursos.pld_kyc) {
      setCargandoRecursos(true);
      listKyc()
        .then((expedientes) =>
          setCatalogoRecursos((prev) => ({
            ...prev,
            pld_kyc: expedientes.map((kyc) => ({
              value: kyc.id_kyc,
              label: `${kyc.id_contraparte}${kyc.curp ? ` · ${kyc.curp}` : ""} — ${
                ESTADO_LLENADO_LABELS[kyc.estado_llenado] ?? kyc.estado_llenado
              }`,
            })),
          }))
        )
        .catch((err) => setError(err instanceof Error ? err.message : "Error al cargar expedientes KYC"))
        .finally(() => setCargandoRecursos(false));
    }
  }, [recursoTipo, catalogoRecursos.pld_kyc]);

  async function handleGenerar(e: React.FormEvent) {
    e.preventDefault();
    setCreando(true);
    setError(null);
    try {
      const nuevo = await createMagicLink({ email, recursoTipo, recursoId });
      setUltimoGenerado(nuevo);
      setEmail("");
      setRecursoTipo("");
      setRecursoId("");
      refrescarLista();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error al generar el link");
    } finally {
      setCreando(false);
    }
  }

  // Acepta un correo por linea o separados por coma/punto y coma - cubre
  // tanto un CSV real (una columna, sin encabezado) como pegar la lista a
  // mano. Filtra encabezados obvios ("correo"/"email") para que no cuente
  // como un invitado mas si el CSV si trae encabezado.
  function parseEmailsCsv(texto: string): string[] {
    return texto
      .split(/[\r\n,;]+/)
      .map((linea) => linea.trim())
      .filter((linea) => linea.length > 0 && !["correo", "email"].includes(linea.toLowerCase()));
  }

  async function handleArchivoCsv(e: React.ChangeEvent<HTMLInputElement>) {
    const archivo = e.target.files?.[0];
    if (!archivo) return;
    setEmailsMasivoTexto(await archivo.text());
    // Limpia el input para poder volver a subir el mismo archivo (ej. tras
    // corregirlo) sin que el navegador ignore la seleccion por ser igual.
    e.target.value = "";
  }

  async function handleCargaMasiva() {
    setError(null);
    setResultadoMasivo(null);
    const emails = parseEmailsCsv(emailsMasivoTexto);
    if (emails.length === 0) {
      setError("Agrega al menos un correo (uno por línea, o sube un CSV).");
      return;
    }
    setCargandoMasivo(true);
    try {
      const resultado = await createMagicLinksMasivo({
        emails,
        recursoTipo: recursoTipoMasivo,
        recursoId: recursoIdMasivo,
      });
      setResultadoMasivo(resultado);
      refrescarLista();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error al cargar el CSV");
    } finally {
      setCargandoMasivo(false);
    }
  }

  async function handleRevocar(magicLinkId: string) {
    try {
      await revokeMagicLink(magicLinkId);
      refrescarLista();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error al revocar");
    }
  }

  // Mismo vocabulario que los otros 3 tipos (pedido explicito 14/Ago/2026:
  // "en temporal igual pendiente, aceptado, expirado, revocado y aparte
  // mostrar el tiempo que le queda") - "Usado"/"Activo" antes no calzaban
  // con "Aceptada"/"Pendiente" de invitaciones y acceso externo.
  function estadoDe(link: IamMagicLink): { label: string; color: "success" | "default" | "error" | "warning" } {
    if (link.revoked_at) return { label: "Revocado", color: "error" };
    if (new Date(link.expires_at) < new Date()) return { label: "Expirado", color: "warning" };
    if (link.uses_count >= link.max_uses) return { label: "Aceptado", color: "success" };
    return { label: "Pendiente", color: "default" };
  }

  // Tiempo que le queda a un link todavia pendiente antes de expirar -
  // solo tiene sentido mostrarlo mientras no este ya revocado/expirado/
  // aceptado (estadoDe ya cubre esos casos aparte).
  function tiempoRestante(expiresAt: string): string {
    const minutos = Math.round((new Date(expiresAt).getTime() - Date.now()) / 60000);
    if (minutos <= 0) return "menos de 1 min";
    if (minutos < 60) return `${minutos} min`;
    const horas = Math.floor(minutos / 60);
    const restoMin = minutos % 60;
    return restoMin > 0 ? `${horas} h ${restoMin} min` : `${horas} h`;
  }

  // Apodo del recurso para la columna de la tabla - usa el catalogo ya
  // cargado en recursoOpciones si coincide (mismo tipo elegido reciente en
  // el formulario); si no, muestra al menos la etiqueta del tipo, nunca el
  // id crudo solo.
  function recursoNombre(link: IamMagicLink): string {
    if (!link.recurso_tipo) return "—";
    const tipoLabel = RECURSO_TIPO_OPTIONS.find((o) => o.value === link.recurso_tipo)?.label ?? link.recurso_tipo;
    const opcion = (catalogoRecursos[link.recurso_tipo] ?? []).find((o) => o.value === link.recurso_id);
    return opcion ? `${tipoLabel} — ${opcion.label}` : tipoLabel;
  }

  return (
    <>
      <Typography variant="body2" color="text.secondary" sx={{ mb: 3 }}>
        Acceso de un solo uso para usuarios externos, sin contraseña. Modo desarrollo — sin envío de
        correo real todavía, el link se muestra aquí directamente en vez de enviarse por email.
      </Typography>

      {error && (
        <Alert severity="error" sx={{ mb: 2 }}>
          {error}
        </Alert>
      )}

      {/* Los dos bloques de generar/subir de aqui abajo se ocultan
      completos (no solo el boton) para quien no tiene iam.crear -
      decision de producto 11/Ago/2026: sin permiso, los campos del
      formulario no llevan a nada (distinto de Revocar en la tabla de
      abajo, que se deja visible-deshabilitado). */}
      {puedeCrear && (
      <Paper variant="outlined" sx={{ p: 3, mb: 3 }}>
        <Typography variant="subtitle1" fontWeight={600} gutterBottom>
          Generar Magic Link
        </Typography>
        <Stack component="form" direction={{ xs: "column", sm: "row" }} spacing={2} onSubmit={handleGenerar}>
          <TextField
            size="small"
            label="Correo del usuario externo"
            type="email"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            sx={{ flex: 2 }}
          />
          <FormControl size="small" sx={{ flex: 1, minWidth: 180 }}>
            <InputLabel id="recurso-tipo-label">Da acceso a</InputLabel>
            <Select
              labelId="recurso-tipo-label"
              label="Da acceso a"
              value={recursoTipo}
              onChange={(e) => setRecursoTipo(e.target.value)}
            >
              <MenuItem value="">
                <em>Sin recurso específico</em>
              </MenuItem>
              {RECURSO_TIPO_OPTIONS.map((o) => (
                <MenuItem key={o.value} value={o.value}>
                  {o.label}
                </MenuItem>
              ))}
            </Select>
          </FormControl>
          <FormControl size="small" sx={{ flex: 1, minWidth: 200 }} disabled={!recursoTipo || cargandoRecursos}>
            <InputLabel id="recurso-id-label">Expediente</InputLabel>
            <Select
              labelId="recurso-id-label"
              label="Expediente"
              value={recursoId}
              onChange={(e) => setRecursoId(e.target.value)}
            >
              {cargandoRecursos ? (
                <MenuItem value="" disabled>
                  Cargando…
                </MenuItem>
              ) : recursoOpciones.length === 0 ? (
                <MenuItem value="" disabled>
                  Sin expedientes disponibles
                </MenuItem>
              ) : (
                recursoOpciones.map((o) => (
                  <MenuItem key={o.value} value={o.value}>
                    {o.label}
                  </MenuItem>
                ))
              )}
            </Select>
          </FormControl>
          <Button
            type="submit"
            variant="contained"
            startIcon={<Link2 size={16} strokeWidth={1.5} />}
            disabled={creando}
          >
            {creando ? <CircularProgress size={20} color="inherit" /> : "Generar"}
          </Button>
        </Stack>

        {ultimoGenerado && (
          <Alert severity="info" sx={{ mt: 2 }} icon={<Copy size={18} strokeWidth={1.5} />}>
            Link generado para <strong>{ultimoGenerado.email}</strong> (expira el{" "}
            {new Date(ultimoGenerado.expires_at).toLocaleString("es-MX")}):
            <Typography
              component="pre"
              variant="caption"
              sx={{ mt: 1, wordBreak: "break-all", whiteSpace: "pre-wrap" }}
            >
              {ultimoGenerado.magic_link_url}
            </Typography>
          </Alert>
        )}
      </Paper>
      )}

      {puedeCrear && (
      <Paper variant="outlined" sx={{ p: 3, mb: 3 }}>
        <Typography variant="subtitle1" fontWeight={600} gutterBottom>
          Carga masiva por CSV
        </Typography>
        <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
          Sube un CSV (una columna, un correo por fila) o pega la lista abajo — un Magic Link por
          cada correo, todos con el mismo recurso.
        </Typography>
        <Stack spacing={2}>
          <Stack direction={{ xs: "column", sm: "row" }} spacing={2}>
            <FormControl size="small" sx={{ flex: 1, minWidth: 180 }}>
              <InputLabel id="recurso-tipo-masivo-label">Da acceso a</InputLabel>
              <Select
                labelId="recurso-tipo-masivo-label"
                label="Da acceso a"
                value={recursoTipoMasivo}
                onChange={(e) => {
                  setRecursoTipoMasivo(e.target.value);
                  setRecursoIdMasivo("");
                }}
              >
                <MenuItem value="">
                  <em>Sin recurso específico</em>
                </MenuItem>
                {RECURSO_TIPO_OPTIONS.map((o) => (
                  <MenuItem key={o.value} value={o.value}>
                    {o.label}
                  </MenuItem>
                ))}
              </Select>
            </FormControl>
            <FormControl size="small" sx={{ flex: 1, minWidth: 200 }} disabled={!recursoTipoMasivo}>
              <InputLabel id="recurso-id-masivo-label">Expediente</InputLabel>
              <Select
                labelId="recurso-id-masivo-label"
                label="Expediente"
                value={recursoIdMasivo}
                onChange={(e) => setRecursoIdMasivo(e.target.value)}
              >
                {recursoOpcionesMasivo.length === 0 ? (
                  <MenuItem value="" disabled>
                    Sin expedientes disponibles
                  </MenuItem>
                ) : (
                  recursoOpcionesMasivo.map((o) => (
                    <MenuItem key={o.value} value={o.value}>
                      {o.label}
                    </MenuItem>
                  ))
                )}
              </Select>
            </FormControl>
            <Button component="label" variant="outlined" startIcon={<UploadCloud size={16} strokeWidth={1.5} />}>
              Subir CSV
              <input type="file" accept=".csv,text/csv" hidden onChange={handleArchivoCsv} />
            </Button>
          </Stack>
          <TextField
            multiline
            minRows={4}
            placeholder={"correo1@ejemplo.com\ncorreo2@ejemplo.com\ncorreo3@ejemplo.com"}
            value={emailsMasivoTexto}
            onChange={(e) => setEmailsMasivoTexto(e.target.value)}
          />
          <Button
            variant="contained"
            startIcon={<UploadCloud size={16} strokeWidth={1.5} />}
            onClick={handleCargaMasiva}
            disabled={cargandoMasivo || !emailsMasivoTexto.trim()}
            sx={{ alignSelf: "flex-start" }}
          >
            {cargandoMasivo ? <CircularProgress size={20} color="inherit" /> : "Cargar"}
          </Button>
        </Stack>

        {resultadoMasivo && (
          <Alert severity={resultadoMasivo.errores.length > 0 ? "warning" : "success"} sx={{ mt: 2 }}>
            {resultadoMasivo.creados.length === 0
              ? "No se generó ningún Magic Link."
              : resultadoMasivo.creados.length === 1
                ? "Se generó 1 Magic Link."
                : `Se generaron ${resultadoMasivo.creados.length} Magic Links.`}
            {resultadoMasivo.errores.length > 0 && (
              <>
                {" "}
                {resultadoMasivo.errores.length === 1
                  ? "1 correo no se pudo procesar:"
                  : `${resultadoMasivo.errores.length} correos no se pudieron procesar:`}
                <Typography component="ul" variant="caption" sx={{ mt: 1, mb: 0, pl: 2 }}>
                  {resultadoMasivo.errores.map((err, i) => (
                    <li key={`${err.email}-${i}`}>
                      <strong>{err.email}</strong> — {err.detail}
                    </li>
                  ))}
                </Typography>
              </>
            )}
          </Alert>
        )}
      </Paper>
      )}

      <Paper variant="outlined">
        <TableContainer>
          <Table size="small">
            <TableHead>
              <TableRow>
                <TableCell>Correo</TableCell>
                <TableCell>Recurso</TableCell>
                <TableCell>Emitido</TableCell>
                <TableCell>Expira</TableCell>
                <TableCell>Usos</TableCell>
                <TableCell>Estado</TableCell>
                <TableCell align="right">Acciones</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {loading ? (
                <TableRow>
                  <TableCell colSpan={7} align="center" sx={{ py: 4 }}>
                    <CircularProgress size={24} />
                  </TableCell>
                </TableRow>
              ) : links.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={7} align="center" sx={{ py: 4 }}>
                    <Typography variant="body2" color="text.secondary">
                      Sin Magic Links generados todavía.
                    </Typography>
                  </TableCell>
                </TableRow>
              ) : (
                links.map((link) => {
                  const estado = estadoDe(link);
                  return (
                    <TableRow key={link.magic_link_id} hover>
                      <TableCell>{link.email}</TableCell>
                      <TableCell>{recursoNombre(link)}</TableCell>
                      <TableCell>{new Date(link.issued_at).toLocaleString("es-MX")}</TableCell>
                      <TableCell>{new Date(link.expires_at).toLocaleString("es-MX")}</TableCell>
                      <TableCell>
                        {link.uses_count}/{link.max_uses}
                      </TableCell>
                      <TableCell>
                        <Stack spacing={0.25}>
                          <Chip size="small" label={estado.label} color={estado.color} sx={{ width: "fit-content" }} />
                          {estado.label === "Pendiente" && (
                            <Typography variant="caption" color="text.secondary">
                              Queda {tiempoRestante(link.expires_at)}
                            </Typography>
                          )}
                        </Stack>
                      </TableCell>
                      <TableCell align="right">
                        {estado.label === "Pendiente" && (
                          <Button
                            size="small"
                            variant="outlined"
                            color="error"
                            onClick={() => handleRevocar(link.magic_link_id)}
                            disabled={!puedeEditar}
                          >
                            Revocar
                          </Button>
                        )}
                      </TableCell>
                    </TableRow>
                  );
                })
              )}
            </TableBody>
          </Table>
        </TableContainer>
      </Paper>
    </>
  );
}

// --- Tab 2: Colaboradores (IamInvitation + IamExternalCollaborator) -----

// Unifica los dos mecanismos de alta de "colaborador" (14/Ago/2026, ver
// memoria de sesion "tercer-tipo-invitacion-externo-sin-workspace"): dos
// recuadros de alta distintos (uno para quien SI tiene correo de
// Workspace, otro para quien NO), pero un solo historial abajo - ambos
// terminan siendo "un colaborador de CumbresBI", solo cambia como entra.
// - Invitación Workspace (IamInvitation): sin token ni link, el correo
//   simplemente ya puede iniciar sesión con Google (gate real en
//   auth_views._upsert_identity).
// - Acceso externo (IamExternalCollaborator): SI crea un IamUser real
//   desde ya (para asignarle roles en /admin/directorio) y manda un link
//   que no vence por tiempo, solo se revoca a mano.
type FilaColaborador = {
  key: string;
  tipo: "Workspace" | "Externo";
  email: string;
  invitadoPorEmail: string | null;
  invitadoEl: string;
  estado: { label: string; color: "success" | "default" | "error" };
  acciones: React.ReactNode;
};

function ColaboradoresTab({ session }: { session: SessionUser | null }) {
  const puedeCrear = session?.perm_keys.includes("iam.crear") ?? false;
  const puedeEditar = session?.perm_keys.includes("iam.editar") ?? false;

  // --- Alta Workspace ---
  const [emailWorkspace, setEmailWorkspace] = useState("");
  const [creandoWorkspace, setCreandoWorkspace] = useState(false);
  const [ultimaInvitacionCreada, setUltimaInvitacionCreada] = useState<IamInvitation | null>(null);
  const [invitaciones, setInvitaciones] = useState<IamInvitation[]>([]);

  // --- Alta externa ---
  const [emailExterno, setEmailExterno] = useState("");
  const [displayNameExterno, setDisplayNameExterno] = useState("");
  const [creandoExterno, setCreandoExterno] = useState(false);
  const [ultimoAccesoGenerado, setUltimoAccesoGenerado] = useState<IamExternalCollaborator | null>(null);
  const [accesosExternos, setAccesosExternos] = useState<IamExternalCollaborator[]>([]);
  const [reenviando, setReenviando] = useState<string | null>(null);

  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  function refrescarListas() {
    setLoading(true);
    Promise.all([listInvitations(), listExternalCollaborators()])
      .then(([invs, accesos]) => {
        setInvitaciones(invs);
        setAccesosExternos(accesos);
      })
      .catch((err) => setError(err instanceof Error ? err.message : "Error desconocido"))
      .finally(() => setLoading(false));
  }

  useEffect(() => {
    refrescarListas();
  }, []);

  async function handleInvitarWorkspace(e: React.FormEvent) {
    e.preventDefault();
    setCreandoWorkspace(true);
    setError(null);
    try {
      const nueva = await createInvitation(emailWorkspace);
      setUltimaInvitacionCreada(nueva);
      setEmailWorkspace("");
      refrescarListas();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error al invitar");
    } finally {
      setCreandoWorkspace(false);
    }
  }

  async function handleRevocarInvitacion(invitationId: string) {
    try {
      await revokeInvitation(invitationId);
      refrescarListas();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error al revocar");
    }
  }

  async function handleCrearExterno(e: React.FormEvent) {
    e.preventDefault();
    setCreandoExterno(true);
    setError(null);
    try {
      const nuevo = await createExternalCollaborator({ email: emailExterno, displayName: displayNameExterno });
      setUltimoAccesoGenerado(nuevo);
      setEmailExterno("");
      setDisplayNameExterno("");
      refrescarListas();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error al crear el acceso externo");
    } finally {
      setCreandoExterno(false);
    }
  }

  async function handleRevocarExterno(externalAccessId: string) {
    try {
      await revokeExternalCollaborator(externalAccessId);
      refrescarListas();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error al revocar");
    }
  }

  async function handleReenviarExterno(externalAccessId: string) {
    setReenviando(externalAccessId);
    setError(null);
    try {
      const actualizado = await resendExternalCollaborator(externalAccessId);
      setUltimoAccesoGenerado(actualizado);
      refrescarListas();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error al reenviar");
    } finally {
      setReenviando(null);
    }
  }

  function estadoInvitacion(inv: IamInvitation): { label: string; color: "success" | "default" | "error" } {
    if (inv.revoked_at) return { label: "Revocada", color: "error" };
    if (inv.accepted_at) return { label: "Aceptada", color: "default" };
    return { label: "Pendiente", color: "success" };
  }

  // Mismo vocabulario que las otras 3 (Pendiente/Aceptado/Expirado/
  // Revocado, pedido explicito 14/Ago/2026) - "Activo"/"Sin usar" antes no
  // eran consistentes con "Aceptada" de la invitacion Workspace.
  function estadoExterno(acceso: IamExternalCollaborator): { label: string; color: "success" | "default" | "error" } {
    if (acceso.revoked_at) return { label: "Revocado", color: "error" };
    if (acceso.last_used_at) return { label: "Aceptado", color: "success" };
    return { label: "Pendiente", color: "default" };
  }

  // Historial unico, mas reciente primero - combina ambos mecanismos
  // (misma fila visual, columna "Tipo" distingue de cual se trata).
  const filas: FilaColaborador[] = [
    ...invitaciones.map((inv) => {
      const estado = estadoInvitacion(inv);
      return {
        key: `inv-${inv.invitation_id}`,
        tipo: "Workspace" as const,
        email: inv.email,
        invitadoPorEmail: inv.invited_by_email,
        invitadoEl: inv.invited_at,
        estado,
        acciones:
          estado.label === "Pendiente" ? (
            <Button
              size="small"
              variant="outlined"
              color="error"
              onClick={() => handleRevocarInvitacion(inv.invitation_id)}
              disabled={!puedeEditar}
            >
              Revocar
            </Button>
          ) : null,
      };
    }),
    ...accesosExternos.map((acceso) => {
      const estado = estadoExterno(acceso);
      return {
        key: `ext-${acceso.external_access_id}`,
        tipo: "Externo" as const,
        email: acceso.email,
        invitadoPorEmail: acceso.invited_by_email,
        invitadoEl: acceso.invited_at,
        estado,
        acciones: !acceso.revoked_at ? (
          <Stack direction="row" spacing={1} justifyContent="flex-end">
            <Button
              size="small"
              variant="outlined"
              onClick={() => handleReenviarExterno(acceso.external_access_id)}
              disabled={!puedeEditar || reenviando === acceso.external_access_id}
            >
              {reenviando === acceso.external_access_id ? <CircularProgress size={16} /> : "Reenviar"}
            </Button>
            <Button
              size="small"
              variant="outlined"
              color="error"
              onClick={() => handleRevocarExterno(acceso.external_access_id)}
              disabled={!puedeEditar}
            >
              Revocar
            </Button>
          </Stack>
        ) : null,
      };
    }),
  ].sort((a, b) => new Date(b.invitadoEl).getTime() - new Date(a.invitadoEl).getTime());

  return (
    <>
      {error && (
        <Alert severity="error" sx={{ mb: 2 }}>
          {error}
        </Alert>
      )}

      <Stack direction={{ xs: "column", md: "row" }} spacing={2} sx={{ mb: 3 }} alignItems="stretch">
        {puedeCrear && (
        <Paper variant="outlined" sx={{ p: 3, flex: 1 }}>
          <Typography variant="subtitle1" fontWeight={600} gutterBottom>
            Invitar colaborador Workspace
          </Typography>
          <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
            Un correo que todavía no forma parte de CumbresBI no puede iniciar sesión hasta que un
            Admin lo invite aquí — no hace falta enviarle ningún link, en cuanto queda pendiente ya
            puede entrar con su cuenta de Google Workspace.
          </Typography>
          <Stack component="form" direction={{ xs: "column", sm: "row" }} spacing={2} onSubmit={handleInvitarWorkspace}>
            <TextField
              size="small"
              label="Correo (Google Workspace)"
              type="email"
              required
              value={emailWorkspace}
              onChange={(e) => setEmailWorkspace(e.target.value)}
              sx={{ flex: 1 }}
            />
            <Button
              type="submit"
              variant="contained"
              startIcon={<UserPlus size={16} strokeWidth={1.5} />}
              disabled={creandoWorkspace}
            >
              {creandoWorkspace ? <CircularProgress size={20} color="inherit" /> : "Invitar"}
            </Button>
          </Stack>

          {ultimaInvitacionCreada && (
            <Alert
              severity={ultimaInvitacionCreada.correo_enviado ? "success" : "warning"}
              sx={{ mt: 2 }}
            >
              {ultimaInvitacionCreada.correo_enviado
                ? `Se avisó por correo a ${ultimaInvitacionCreada.email} que ya puede iniciar sesión con Google.`
                : `Invitación creada para ${ultimaInvitacionCreada.email}, pero el correo de aviso no se pudo enviar — ya puede entrar con Google de todas formas.`}
            </Alert>
          )}
        </Paper>
        )}

        {puedeCrear && (
        <Paper variant="outlined" sx={{ p: 3, flex: 1 }}>
          <Typography variant="subtitle1" fontWeight={600} gutterBottom>
            Dar acceso a un colaborador externo
          </Typography>
          <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
            Para quien no tiene correo de Google Workspace pero necesita entrar a secciones reales
            (roles/permisos asignados desde /admin/directorio). El link no vence por tiempo — solo
            se revoca a mano.
          </Typography>
          <Stack component="form" direction={{ xs: "column", sm: "row" }} spacing={2} onSubmit={handleCrearExterno}>
            <TextField
              size="small"
              label="Correo del colaborador"
              type="email"
              required
              value={emailExterno}
              onChange={(e) => setEmailExterno(e.target.value)}
              sx={{ flex: 1 }}
            />
            <TextField
              size="small"
              label="Nombre (opcional)"
              value={displayNameExterno}
              onChange={(e) => setDisplayNameExterno(e.target.value)}
              sx={{ flex: 1 }}
            />
            <Button
              type="submit"
              variant="contained"
              startIcon={<ShieldOff size={16} strokeWidth={1.5} />}
              disabled={creandoExterno}
            >
              {creandoExterno ? <CircularProgress size={20} color="inherit" /> : "Crear acceso"}
            </Button>
          </Stack>

          {ultimoAccesoGenerado && (
            <Alert severity="info" sx={{ mt: 2 }} icon={<Copy size={18} strokeWidth={1.5} />}>
              Acceso{" "}
              {ultimoAccesoGenerado.correo_enviado ? "generado y enviado" : "generado (el correo no se pudo enviar)"}{" "}
              para <strong>{ultimoAccesoGenerado.email}</strong>:
              <Typography
                component="pre"
                variant="caption"
                sx={{ mt: 1, wordBreak: "break-all", whiteSpace: "pre-wrap" }}
              >
                {ultimoAccesoGenerado.acceso_url}
              </Typography>
            </Alert>
          )}
        </Paper>
        )}
      </Stack>

      <Paper variant="outlined">
        <TableContainer>
          <Table size="small">
            <TableHead>
              <TableRow>
                <TableCell>Correo</TableCell>
                <TableCell>Tipo</TableCell>
                <TableCell>Invitado por</TableCell>
                <TableCell>Invitado el</TableCell>
                <TableCell>Estado</TableCell>
                <TableCell align="right">Acciones</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {loading ? (
                <TableRow>
                  <TableCell colSpan={6} align="center" sx={{ py: 4 }}>
                    <CircularProgress size={24} />
                  </TableCell>
                </TableRow>
              ) : filas.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={6} align="center" sx={{ py: 4 }}>
                    <Typography variant="body2" color="text.secondary">
                      Sin colaboradores todavía.
                    </Typography>
                  </TableCell>
                </TableRow>
              ) : (
                filas.map((fila) => (
                  <TableRow key={fila.key} hover>
                    <TableCell>{fila.email}</TableCell>
                    <TableCell>
                      <Chip
                        size="small"
                        variant="outlined"
                        label={fila.tipo}
                        color={fila.tipo === "Externo" ? "info" : "default"}
                      />
                    </TableCell>
                    <TableCell>{fila.invitadoPorEmail ?? "—"}</TableCell>
                    <TableCell>{new Date(fila.invitadoEl).toLocaleString("es-MX")}</TableCell>
                    <TableCell>
                      <Chip size="small" label={fila.estado.label} color={fila.estado.color} />
                    </TableCell>
                    <TableCell align="right">{fila.acciones}</TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </TableContainer>
      </Paper>
    </>
  );
}
