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
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  TextField,
  Typography,
} from "@mui/material";
import { FilePlus2, FolderOpen, Search } from "lucide-react";
import AppShell from "@/components/AppShell";
import { BRAND } from "@/theme/theme";
import { SessionUser, getSession } from "@/lib/auth";
import { PldContraparteKyc, createKyc, listKyc } from "@/lib/pld";

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
  const [expedientes, setExpedientes] = useState<PldContraparteKyc[]>([]);
  const [search, setSearch] = useState("");
  const [estadoLlenado, setEstadoLlenado] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Nuevo expediente (17/Ago/2026, Opcion B): dialogo minimo - solo
  // sociedad opcional, el resto lo llena el cliente despues via el link
  // publico. Ver memoria de sesion "pld-crear-expediente-opcion-b".
  const [dialogoAbierto, setDialogoAbierto] = useState(false);
  const [sociedadRfc, setSociedadRfc] = useState("");
  const [creando, setCreando] = useState(false);
  const [creandoError, setCreandoError] = useState<string | null>(null);

  function cargar() {
    setLoading(true);
    setError(null);
    listKyc({ estadoLlenado: estadoLlenado || undefined, search: search || undefined })
      .then(setExpedientes)
      .catch((err) => setError(err instanceof Error ? err.message : "Error desconocido"))
      .finally(() => setLoading(false));
  }

  useEffect(() => {
    const timeout = setTimeout(cargar, 300);
    return () => clearTimeout(timeout);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [search, estadoLlenado]);

  // Aprobar/reactivar se movieron a la vista de detalle (/pld/[idKyc],
  // 17/Ago/2026) - la lista ya solo tiene "Ver", igual que se acordo con
  // Mariana.

  async function handleCrearExpediente(e: React.FormEvent) {
    e.preventDefault();
    if (!session?.user_id) return;
    setCreando(true);
    setCreandoError(null);
    try {
      await createKyc({ createdBy: session.user_id, sociedadRfc: sociedadRfc || undefined });
      setDialogoAbierto(false);
      setSociedadRfc("");
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
            onClick={() => setDialogoAbierto(true)}
          >
            Nuevo expediente
          </Button>
        )}
      </Stack>

      <Dialog open={dialogoAbierto} onClose={() => setDialogoAbierto(false)} fullWidth maxWidth="xs">
        <DialogTitle>Nuevo expediente KYC</DialogTitle>
        <Stack component="form" onSubmit={handleCrearExpediente}>
          <DialogContent>
            <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
              Se crea un expediente vacío — el cliente llena sus propios datos después, desde el
              link público que le mandes (Tickets de cliente). No hace falta capturar nada más aquí.
            </Typography>
            <TextField
              size="small"
              fullWidth
              label="Sociedad (RFC, opcional)"
              value={sociedadRfc}
              onChange={(e) => setSociedadRfc(e.target.value)}
            />
            {creandoError && (
              <Alert severity="error" sx={{ mt: 2 }}>
                {creandoError}
              </Alert>
            )}
          </DialogContent>
          <DialogActions>
            <Button onClick={() => setDialogoAbierto(false)}>Cancelar</Button>
            <Button type="submit" variant="contained" disabled={creando}>
              {creando ? <CircularProgress size={20} color="inherit" /> : "Crear expediente"}
            </Button>
          </DialogActions>
        </Stack>
      </Dialog>

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
              <TableCell>CURP</TableCell>
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
                <TableCell colSpan={7} align="center" sx={{ py: 4 }}>
                  <CircularProgress size={24} />
                </TableCell>
              </TableRow>
            ) : expedientes.length === 0 ? (
              <TableRow>
                <TableCell colSpan={7} align="center" sx={{ py: 4 }}>
                  <Typography variant="body2" color="text.secondary">
                    Sin expedientes todavía.
                  </Typography>
                </TableCell>
              </TableRow>
            ) : (
              expedientes.map((kyc) => (
                <TableRow key={kyc.id_kyc} hover>
                  <TableCell>{kyc.id_contraparte}</TableCell>
                  <TableCell>{kyc.curp || "—"}</TableCell>
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
