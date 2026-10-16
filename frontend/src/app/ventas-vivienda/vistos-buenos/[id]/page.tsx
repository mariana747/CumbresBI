"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter, useSearchParams } from "next/navigation";
import {
  Alert,
  Box,
  Button,
  Chip,
  CircularProgress,
  Divider,
  FormControl,
  Grid,
  IconButton,
  InputLabel,
  MenuItem,
  Paper,
  Select,
  Stack,
  TextField,
  Typography,
} from "@mui/material";
import { ArrowLeft } from "lucide-react";
import {
  ViviendaExpedienteItem,
  ViviendaItemStatus,
  ViviendaItemResponsable,
  listItemsByDenominacion,
  updateItem,
} from "@/lib/vivienda";
import { SessionUser, getSession } from "@/lib/auth";

const ITEM_STATUS_LABELS: Record<ViviendaItemStatus, string> = {
  PENDIENTE: "Pendiente",
  "NO APLICA": "No aplica",
  INCOMPLETO: "Incompleto",
  ENTREGADO: "Entregado",
  APROBADO: "Aprobado",
  RECHAZADO: "Rechazado",
  POSPUESTO: "Pospuesto",
};

const ITEM_STATUS_COLORS: Record<ViviendaItemStatus, "default" | "warning" | "info" | "success" | "error"> = {
  PENDIENTE: "error",
  "NO APLICA": "default",
  INCOMPLETO: "warning",
  ENTREGADO: "info",
  APROBADO: "success",
  RECHAZADO: "error",
  POSPUESTO: "warning",
};

const RESPONSABLE_LABELS: Record<ViviendaItemResponsable, string> = {
  VENTAS: "Ventas",
  ESCRITURACION: "Escrituración",
  TESORERIA: "Tesorería",
  CONTABILIDAD: "Contabilidad",
  LEGAL: "Legal",
};

function fmtFecha(f: string | null): string {
  if (!f) return "—";
  const d = new Date(f);
  return isNaN(d.getTime()) ? f : d.toLocaleDateString("es-MX");
}

export default function VistoBuenoDetailPage() {
  const { id } = useParams<{ id: string }>();
  const searchParams = useSearchParams();
  const denominacion = searchParams.get("denominacion") ?? "";
  const router = useRouter();

  const [session, setSession] = useState<SessionUser | null>(null);
  const [item, setItem] = useState<ViviendaExpedienteItem | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [formStatus, setFormStatus] = useState<ViviendaItemStatus>("PENDIENTE");
  const [formResponsable, setFormResponsable] = useState<ViviendaItemResponsable | "">("");
  const [formFechaEntrega, setFormFechaEntrega] = useState("");
  const [formFechaCierre, setFormFechaCierre] = useState("");
  const [formLinkDocumento, setFormLinkDocumento] = useState("");
  const [formComentarios, setFormComentarios] = useState("");
  const [guardando, setGuardando] = useState(false);
  const [errorGuardar, setErrorGuardar] = useState<string | null>(null);

  const puedeEditar = session?.perm_keys.includes("ventas-vivienda.editar") ?? false;

  useEffect(() => {
    getSession().then(setSession);
  }, []);

  useEffect(() => {
    if (!denominacion) { setError("Falta denominación"); setLoading(false); return; }
    setLoading(true);
    listItemsByDenominacion(denominacion)
      .then((items) => {
        const found = items.find((i) => i.id_item === id);
        if (!found) { setError("Item no encontrado"); return; }
        setItem(found);
        setFormStatus(found.status);
        setFormResponsable(found.responsable || "");
        setFormFechaEntrega(found.fecha_entrega || "");
        setFormFechaCierre(found.fecha_cierre || "");
        setFormLinkDocumento(found.link_documento || "");
        setFormComentarios(found.comentarios || "");
      })
      .catch((e) => setError(String(e)))
      .finally(() => setLoading(false));
  }, [id, denominacion]);

  async function guardar() {
    if (!item || !session) return;
    setGuardando(true);
    setErrorGuardar(null);
    try {
      const updated = await updateItem(
        item.id_item,
        {
          status: formStatus,
          responsable: (formResponsable as ViviendaItemResponsable) || null,
          fechaEntrega: formFechaEntrega || null,
          fechaCierre: formFechaCierre || null,
          linkDocumento: formLinkDocumento || null,
          comentarios: formComentarios || null,
        },
        session.user_id
      );
      setItem(updated);
    } catch (err) {
      setErrorGuardar(err instanceof Error ? err.message : "Error al guardar");
    } finally {
      setGuardando(false);
    }
  }

  if (loading) return <Box sx={{ p: 4 }}><CircularProgress size={24} /></Box>;
  if (error || !item) return <Box sx={{ p: 4 }}><Alert severity="error">{error ?? "No encontrado"}</Alert></Box>;

  return (
    <Box sx={{ p: { xs: 2, md: 4 }, maxWidth: 800, mx: "auto" }}>
      <Stack direction="row" alignItems="center" spacing={1} sx={{ mb: 3 }}>
        <IconButton size="small" onClick={() => router.back()}>
          <ArrowLeft size={18} strokeWidth={1.5} />
        </IconButton>
        <Typography variant="h6" fontWeight={600}>{item.denominacion ?? "Visto bueno"}</Typography>
      </Stack>

      <Grid container spacing={3}>
        {/* Columna izquierda — datos del item */}
        <Grid item xs={12} md={4}>
          <Paper variant="outlined" sx={{ p: 2 }}>
            <Stack spacing={1.5}>
              <Chip
                label={ITEM_STATUS_LABELS[item.status]}
                color={ITEM_STATUS_COLORS[item.status]}
                size="small"
                sx={{ alignSelf: "flex-start" }}
              />
              <Divider />
              {[
                { label: "Expediente", value: item.expediente },
                { label: "Vivienda", value: item.expediente_vivienda_denominacion },
                { label: "Responsable", value: item.responsable ? RESPONSABLE_LABELS[item.responsable] : null },
                { label: "Fecha solicitud", value: fmtFecha(item.fecha_solicitud) },
                { label: "Fecha límite", value: fmtFecha(item.fecha_limite) },
                { label: "Fecha entrega", value: fmtFecha(item.fecha_entrega) },
                { label: "Fecha cierre", value: fmtFecha(item.fecha_cierre) },
                { label: "Creado por", value: item.created_by },
                { label: "Actualizado por", value: item.updated_by },
              ].map(({ label, value }) => (
                <Box key={label}>
                  <Typography variant="caption" color="text.secondary">{label}</Typography>
                  <Typography variant="body2">{value ?? "—"}</Typography>
                </Box>
              ))}
            </Stack>
          </Paper>
        </Grid>

        {/* Columna derecha — formulario de edición */}
        <Grid item xs={12} md={8}>
          <Paper variant="outlined" sx={{ p: 2 }}>
            <Typography variant="subtitle2" sx={{ mb: 2 }}>Editar</Typography>
            {errorGuardar && <Alert severity="error" sx={{ mb: 2 }}>{errorGuardar}</Alert>}
            <Stack spacing={2}>
              <FormControl size="small" fullWidth disabled={!puedeEditar}>
                <InputLabel>Status</InputLabel>
                <Select label="Status" value={formStatus} onChange={(e) => setFormStatus(e.target.value as ViviendaItemStatus)}>
                  {Object.entries(ITEM_STATUS_LABELS).map(([value, label]) => (
                    <MenuItem key={value} value={value}>{label}</MenuItem>
                  ))}
                </Select>
              </FormControl>
              <FormControl size="small" fullWidth disabled={!puedeEditar}>
                <InputLabel>Responsable</InputLabel>
                <Select label="Responsable" value={formResponsable} onChange={(e) => setFormResponsable(e.target.value as ViviendaItemResponsable | "")}>
                  <MenuItem value="">—</MenuItem>
                  {Object.entries(RESPONSABLE_LABELS).map(([value, label]) => (
                    <MenuItem key={value} value={value}>{label}</MenuItem>
                  ))}
                </Select>
              </FormControl>
              <Grid container spacing={2}>
                <Grid item xs={6}>
                  <TextField
                    size="small" label="Fecha entrega" type="date" fullWidth
                    InputLabelProps={{ shrink: true }}
                    value={formFechaEntrega}
                    onChange={(e) => setFormFechaEntrega(e.target.value)}
                    disabled={!puedeEditar}
                  />
                </Grid>
                <Grid item xs={6}>
                  <TextField
                    size="small" label="Fecha cierre" type="date" fullWidth
                    InputLabelProps={{ shrink: true }}
                    value={formFechaCierre}
                    onChange={(e) => setFormFechaCierre(e.target.value)}
                    disabled={!puedeEditar}
                  />
                </Grid>
              </Grid>
              <TextField
                size="small" label="Link documento" fullWidth
                value={formLinkDocumento}
                onChange={(e) => setFormLinkDocumento(e.target.value)}
                disabled={!puedeEditar}
              />
              <TextField
                size="small" label="Comentarios" multiline minRows={3} fullWidth
                value={formComentarios}
                onChange={(e) => setFormComentarios(e.target.value)}
                disabled={!puedeEditar}
              />
              {puedeEditar && (
                <Stack direction="row" justifyContent="flex-end">
                  <Button variant="contained" onClick={guardar} disabled={guardando}>
                    {guardando ? <CircularProgress size={16} /> : "Guardar"}
                  </Button>
                </Stack>
              )}
            </Stack>
          </Paper>
        </Grid>
      </Grid>
    </Box>
  );
}
