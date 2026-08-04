"use client";

import { useEffect, useState } from "react";
import {
  Alert,
  Button,
  Chip,
  CircularProgress,
  FormControl,
  InputLabel,
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
import { Copy, Link2, ShieldCheck } from "lucide-react";
import AdminTabs from "@/components/AdminTabs";
import AppShell from "@/components/AppShell";
import {
  IamMagicLink,
  createMagicLink,
  listMagicLinks,
  revokeMagicLink,
  validateMagicLink,
} from "@/lib/iam";
import { listKyc } from "@/lib/pld";

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

// Magic Links (Fase 1, Semana 4) - pantalla de prueba en modo dev. Sin
// envio de correo real todavia (ver iam/views.py) - por eso esta pantalla
// muestra el token/link generado directamente en lugar de solo "enviarlo".
// Cuando exista el envio real desde Workspace, esta pantalla deja de
// mostrar el token y solo confirma que se envio.
export default function MagicLinksPage() {
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

  const [tokenPrueba, setTokenPrueba] = useState("");
  const [resultadoValidacion, setResultadoValidacion] = useState<{ jwt: string } | string | null>(null);

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
      setTokenPrueba(nuevo.token ?? "");
      setResultadoValidacion(null);
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

  async function handleValidar() {
    setResultadoValidacion(null);
    setError(null);
    try {
      const resultado = await validateMagicLink(tokenPrueba);
      setResultadoValidacion({ jwt: resultado.jwt });
      refrescarLista();
    } catch (err) {
      setResultadoValidacion(err instanceof Error ? err.message : "Token invalido");
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

  function estadoDe(link: IamMagicLink): { label: string; color: "success" | "default" | "error" | "warning" } {
    if (link.revoked_at) return { label: "Revocado", color: "error" };
    if (new Date(link.expires_at) < new Date()) return { label: "Expirado", color: "warning" };
    if (link.uses_count >= link.max_uses) return { label: "Usado", color: "default" };
    return { label: "Activo", color: "success" };
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
    <AppShell>
      <AdminTabs />
      <Typography variant="h5" gutterBottom>
        Magic Links
      </Typography>
      <Typography variant="body2" color="text.secondary" sx={{ mb: 3 }}>
        Acceso de un solo uso para usuarios externos, sin contraseña. Modo desarrollo — sin envío de
        correo real todavía, el link se muestra aquí directamente en vez de enviarse por email.
      </Typography>

      {error && (
        <Alert severity="error" sx={{ mb: 2 }}>
          {error}
        </Alert>
      )}

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

      <Paper variant="outlined" sx={{ p: 3, mb: 3 }}>
        <Typography variant="subtitle1" fontWeight={600} gutterBottom>
          Probar validación
        </Typography>
        <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
          Simula que el usuario externo abrió el link — pega el token (o usa el recién generado) para
          ver el JWT de alcance externo que se emite.
        </Typography>
        <Stack direction={{ xs: "column", sm: "row" }} spacing={2}>
          <TextField
            size="small"
            label="Token"
            value={tokenPrueba}
            onChange={(e) => setTokenPrueba(e.target.value)}
            sx={{ flex: 1 }}
          />
          <Button
            variant="outlined"
            startIcon={<ShieldCheck size={16} strokeWidth={1.5} />}
            onClick={handleValidar}
            disabled={!tokenPrueba}
          >
            Validar
          </Button>
        </Stack>

        {resultadoValidacion && typeof resultadoValidacion === "string" && (
          <Alert severity="error" sx={{ mt: 2 }}>
            {resultadoValidacion}
          </Alert>
        )}
        {resultadoValidacion && typeof resultadoValidacion === "object" && (
          <Alert severity="success" sx={{ mt: 2 }}>
            Token válido — JWT emitido:
            <Typography
              component="pre"
              variant="caption"
              sx={{ mt: 1, wordBreak: "break-all", whiteSpace: "pre-wrap" }}
            >
              {resultadoValidacion.jwt}
            </Typography>
          </Alert>
        )}
      </Paper>

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
                        <Chip size="small" label={estado.label} color={estado.color} />
                      </TableCell>
                      <TableCell align="right">
                        {estado.label === "Activo" && (
                          <Button
                            size="small"
                            variant="outlined"
                            color="error"
                            onClick={() => handleRevocar(link.magic_link_id)}
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
    </AppShell>
  );
}
