"use client";

import { useEffect, useState } from "react";
import {
  Alert,
  Button,
  Chip,
  CircularProgress,
  FormControl,
  Grid,
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
import { CheckCircle2, FileSearch, FolderOpen, Search, UploadCloud } from "lucide-react";
import AppShell from "@/components/AppShell";
import MotorDocumentalDialog from "@/components/MotorDocumentalDialog";
import { BRAND } from "@/theme/theme";
import { SessionUser, getSession } from "@/lib/auth";
import { PldContraparteKyc, aprobarKyc, listKyc } from "@/lib/pld";

// Tipos que el Motor Documental ya reconoce (docint/classifier.py) - se
// muestran aqui solo como referencia informativa para el analista, no como
// selector (la deteccion es automatica por nombre de archivo).
const SUPPORTED_DOCUMENT_TYPES = [
  "INE / IFE",
  "CURP",
  "Comprobante de domicilio",
  "Constancia de situación fiscal",
  "Acta de nacimiento",
  "Acta constitutiva",
];

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
  const puedeAprobar = session?.perm_keys.includes("pld-compliance.aprobar") ?? false;
  const [expedientes, setExpedientes] = useState<PldContraparteKyc[]>([]);
  const [search, setSearch] = useState("");
  const [estadoLlenado, setEstadoLlenado] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [aprobando, setAprobando] = useState<string | null>(null);

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

  async function handleAprobar(idKyc: string) {
    setAprobando(idKyc);
    try {
      // aprobado_por: sesion simulada todavia (src/lib/auth.ts) - no hay
      // usuario real que resolver aqui hasta que exista el login OIDC real
      // (ver iam-service). Placeholder explicito, no un valor inventado.
      await aprobarKyc(idKyc, "sin-auth");
      cargar();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error desconocido");
    } finally {
      setAprobando(null);
    }
  }

  return (
    <Paper variant="outlined" sx={{ p: 3 }}>
      <Stack direction="row" spacing={1.5} alignItems="center" sx={{ mb: 2 }}>
        <FolderOpen size={22} strokeWidth={1.5} color={BRAND.azul} />
        <Typography variant="subtitle1" fontWeight={600}>
          Expedientes KYC
        </Typography>
      </Stack>

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
                    <Chip
                      size="small"
                      label={ESTADO_OPTIONS.find((o) => o.value === kyc.estado_llenado)?.label ?? kyc.estado_llenado}
                      color={ESTADO_COLOR[kyc.estado_llenado] ?? "default"}
                    />
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
                    {!kyc.aprobado_en && (
                      <Button
                        size="small"
                        variant="outlined"
                        startIcon={<CheckCircle2 size={16} strokeWidth={1.5} />}
                        disabled={aprobando === kyc.id_kyc || !puedeAprobar}
                        onClick={() => handleAprobar(kyc.id_kyc)}
                      >
                        Aprobar
                      </Button>
                    )}
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
  const [open, setOpen] = useState(false);
  const [session, setSession] = useState<SessionUser | null>(null);

  useEffect(() => {
    getSession().then(setSession);
  }, []);

  // El Motor Documental en si (analyzeDocument) no escribe en pld-service,
  // pero conceptualmente es captura de documentos para un expediente KYC -
  // se gatea igual que "crear" (mismo criterio que PldContraparteDocViewSet,
  // pld-compliance.crear) para que un rol de solo lectura (ej. AUDITOR) no
  // pueda usarlo, aunque el backend de docint no lo bloquee el mismo.
  const puedeCrear = session?.perm_keys.includes("pld-compliance.crear") ?? false;

  return (
    <AppShell>
      <Typography variant="h5" gutterBottom>
        PLD / Cumplimiento
      </Typography>
      <Typography variant="body2" color="text.secondary" sx={{ mb: 3 }}>
        Expedientes KYC, documentos y el Motor Documental como su primer consumidor.
      </Typography>

      <Grid container spacing={3}>
        <Grid item xs={12} md={7}>
          <Paper
            variant="outlined"
            sx={{
              p: 3,
              height: "100%",
              display: "flex",
              flexDirection: "column",
              gap: 2,
            }}
          >
            <Stack direction="row" spacing={1.5} alignItems="center">
              <FileSearch size={22} strokeWidth={1.5} color={BRAND.azul} />
              <Typography variant="subtitle1" fontWeight={600}>
                Motor Documental
              </Typography>
            </Stack>
            <Typography variant="body2" color="text.secondary">
              Analiza identificaciones, comprobantes y documentos de soporte
              con IA. Puedes subir varios archivos de la misma persona a la
              vez (ej. INE, CURP y comprobante) — el tipo se detecta
              automáticamente por el nombre del archivo.
            </Typography>
            {/* Oculto (no solo deshabilitado) para quien no tiene
            pld-compliance.crear - decision de producto 11/Ago/2026: para
            las acciones de generar/subir, un rol de solo lectura no debe
            ni ver el boton (distinto del criterio de otorgar/revocar,
            que si se deja visible-deshabilitado). */}
            {puedeCrear && (
              <Button
                variant="contained"
                startIcon={<UploadCloud size={18} strokeWidth={1.5} />}
                onClick={() => setOpen(true)}
                sx={{ alignSelf: "flex-start", mt: "auto" }}
              >
                Cargar documento
              </Button>
            )}
          </Paper>
        </Grid>

        <Grid item xs={12} md={5}>
          <Paper variant="outlined" sx={{ p: 3, height: "100%" }}>
            <Typography variant="subtitle1" fontWeight={600} gutterBottom>
              Tipos de documento soportados
            </Typography>
            <Stack direction="row" flexWrap="wrap" useFlexGap gap={1} sx={{ mt: 1.5 }}>
              {SUPPORTED_DOCUMENT_TYPES.map((label) => (
                <Chip key={label} label={label} size="small" variant="outlined" />
              ))}
            </Stack>
          </Paper>
        </Grid>

        <Grid item xs={12}>
          <TablaExpedientes session={session} />
        </Grid>
      </Grid>

      <MotorDocumentalDialog open={open} onClose={() => setOpen(false)} />
    </AppShell>
  );
}
