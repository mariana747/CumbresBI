"use client";

import { useEffect, useState } from "react";
import {
  Alert,
  Chip,
  CircularProgress,
  Divider,
  Paper,
  Stack,
  Tab,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Tabs,
  Typography,
} from "@mui/material";
import { ViviendaExpedienteItem, ViviendaExpedienteEstado, ViviendaItemStatus, listItemsByDenominacion } from "@/lib/vivienda";

const ITEM_STATUS_COLORS: Record<ViviendaItemStatus, "default" | "warning" | "info" | "success" | "error"> = {
  PENDIENTE: "default",
  "NO APLICA": "default",
  INCOMPLETO: "warning",
  ENTREGADO: "info",
  APROBADO: "success",
  RECHAZADO: "error",
  POSPUESTO: "warning",
};

const ITEM_STATUS_LABELS: Record<ViviendaItemStatus, string> = {
  PENDIENTE: "Pendiente",
  "NO APLICA": "No aplica",
  INCOMPLETO: "Incompleto",
  ENTREGADO: "Entregado",
  APROBADO: "Aprobado",
  RECHAZADO: "Rechazado",
  POSPUESTO: "Pospuesto",
};

const EXPEDIENTE_ESTADO_COLORS: Record<ViviendaExpedienteEstado, "default" | "warning" | "info" | "success" | "error"> = {
  PENDIENTE: "default",
  "EN PROCESO": "info",
  FIRMADO: "warning",
  CONCLUIDO: "success",
  CANCELADO: "error",
};

function fmtFecha(f: string | null): string {
  if (!f) return "—";
  const d = new Date(f);
  return isNaN(d.getTime()) ? f : d.toLocaleDateString("es-MX");
}

type TabStatus = "APROBADO" | "POSPUESTO" | "NO APLICA" | "";

type TabConfig = { label: string; value: TabStatus }[];

export default function VistosBuenosTab({
  denominacion,
  tabs,
  defaultTab,
}: {
  denominacion: string;
  tabs?: TabConfig;
  defaultTab?: TabStatus;
}) {
  const [items, setItems] = useState<ViviendaExpedienteItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [tab, setTab] = useState<TabStatus>(defaultTab ?? "APROBADO");

  useEffect(() => {
    setLoading(true);
    listItemsByDenominacion(denominacion)
      .then(setItems)
      .catch((e) => setError(String(e)))
      .finally(() => setLoading(false));
  }, [denominacion]);

  if (loading) return <CircularProgress size={24} sx={{ mt: 2 }} />;
  if (error) return <Alert severity="error">{error}</Alert>;

  const visibles = tabs && tab ? items.filter((i) => i.status === tab) : items;

  return (
    <Paper variant="outlined">
      {tabs && (
        <>
          <Tabs value={tab} onChange={(_, v) => setTab(v)} sx={{ px: 1, minHeight: 36 }}>
            {tabs.map((t) => (
              <Tab key={t.value} label={t.label} value={t.value} sx={{ minHeight: 36, py: 0.5 }} />
            ))}
          </Tabs>
          <Divider />
        </>
      )}
    <TableContainer>
      <Table size="small">
        <TableHead>
          <TableRow>
            <TableCell>Vivienda</TableCell>
            <TableCell>Expediente</TableCell>
            <TableCell>Estado expediente</TableCell>
            <TableCell>Visto bueno</TableCell>
            <TableCell>Responsable</TableCell>
            <TableCell>Fecha cierre</TableCell>
            <TableCell>Comentarios</TableCell>
          </TableRow>
        </TableHead>
        <TableBody>
          {visibles.length === 0 && (
            <TableRow>
              <TableCell colSpan={7}>
                <Typography variant="body2" color="text.secondary" sx={{ py: 1 }}>
                  Sin registros.
                </Typography>
              </TableCell>
            </TableRow>
          )}
          {visibles.map((item) => (
            <TableRow key={item.id_item} hover>
              <TableCell>{item.expediente_vivienda_denominacion ?? "—"}</TableCell>
              <TableCell>
                <Typography variant="caption" fontFamily="monospace">
                  {item.expediente.slice(0, 8).toUpperCase()}
                </Typography>
              </TableCell>
              <TableCell>
                {item.expediente_estado ? (
                  <Chip
                    label={item.expediente_estado}
                    size="small"
                    color={EXPEDIENTE_ESTADO_COLORS[item.expediente_estado] ?? "default"}
                  />
                ) : (
                  "—"
                )}
              </TableCell>
              <TableCell>
                <Chip
                  label={ITEM_STATUS_LABELS[item.status]}
                  size="small"
                  color={ITEM_STATUS_COLORS[item.status]}
                />
              </TableCell>
              <TableCell>{item.responsable ?? "—"}</TableCell>
              <TableCell>{fmtFecha(item.fecha_cierre)}</TableCell>
              <TableCell>
                <Stack direction="row" spacing={1} alignItems="center">
                  <Typography variant="body2" noWrap sx={{ maxWidth: 240 }}>
                    {item.comentarios || "—"}
                  </Typography>
                </Stack>
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </TableContainer>
    </Paper>
  );
}
