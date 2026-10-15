"use client";

import { useEffect, useState } from "react";
import {
  Alert,
  Button,
  Card,
  CardContent,
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
  TablePagination,
  TableRow,
  Tabs,
  Typography,
  useMediaQuery,
  useTheme,
} from "@mui/material";
import { FileSpreadsheet } from "lucide-react";
import { ViviendaExpedienteItem, ViviendaExpedienteEstado, ViviendaItemStatus, listItemsByDenominacion } from "@/lib/vivienda";
import FiltrosBar from "@/components/FiltrosBar";
import { descargarCsv } from "@/lib/descargarCsv";

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

type TabStatus = ViviendaItemStatus | "";

type TabConfig = { label: string; value: TabStatus }[];

export default function VistosBuenosTab({
  denominacion,
  tabs,
  defaultTab,
  nombreArchivo = "vistos-buenos",
}: {
  denominacion: string;
  tabs?: TabConfig;
  defaultTab?: TabStatus;
  nombreArchivo?: string;
}) {
  const theme = useTheme();
  const esMovil = useMediaQuery(theme.breakpoints.down("sm"));
  const [items, setItems] = useState<ViviendaExpedienteItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [tab, setTab] = useState<TabStatus>(defaultTab ?? "APROBADO");
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(0);
  const [rowsPerPage, setRowsPerPage] = useState(10);

  useEffect(() => {
    setLoading(true);
    listItemsByDenominacion(denominacion)
      .then(setItems)
      .catch((e) => setError(String(e)))
      .finally(() => setLoading(false));
  }, [denominacion]);

  useEffect(() => { setPage(0); }, [tab, search]);

  if (loading) return <CircularProgress size={24} sx={{ mt: 2 }} />;
  if (error) return <Alert severity="error">{error}</Alert>;

  const visibles = items.filter((i) => {
    if (tabs && tab && i.status !== tab) return false;
    if (search) {
      const q = search.toLowerCase();
      return (
        i.expediente_vivienda_denominacion?.toLowerCase().includes(q) ||
        i.expediente?.toLowerCase().includes(q) ||
        i.responsable?.toLowerCase().includes(q) ||
        i.comentarios?.toLowerCase().includes(q)
      );
    }
    return true;
  });

  return (
    <>
    <FiltrosBar
      search={search}
      onSearchChange={setSearch}
      searchPlaceholder="Buscar por vivienda, expediente o responsable..."
      actions={
        <Button
          size="small"
          variant="outlined"
          startIcon={<FileSpreadsheet size={14} strokeWidth={2} />}
          disabled={visibles.length === 0}
          onClick={() =>
            descargarCsv(
              visibles.map((i) => ({
                Vivienda: i.expediente_vivienda_denominacion ?? "",
                Expediente: i.expediente,
                "Estado expediente": i.expediente_estado ?? "",
                "Visto bueno": i.status,
                Responsable: i.responsable ?? "",
                "Fecha cierre": i.fecha_cierre ?? "",
                Comentarios: i.comentarios ?? "",
              })),
              `${nombreArchivo}.csv`
            )
          }
        >
          Descargar CSV
        </Button>
      }
    />
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
    {visibles.length === 0 ? (
      <Stack alignItems="center" sx={{ py: 3 }}><Typography variant="body2" color="text.secondary">Sin registros.</Typography></Stack>
    ) : esMovil ? (
      <Stack spacing={1} sx={{ p: 1.5 }}>
        {visibles.slice(page * rowsPerPage, page * rowsPerPage + rowsPerPage).map((item) => (
          <Card key={item.id_item} variant="outlined">
            <CardContent sx={{ py: 1.5, "&:last-child": { pb: 1.5 } }}>
              <Typography variant="body2" fontWeight={600}>{item.expediente_vivienda_denominacion ?? "—"}</Typography>
              <Stack direction="row" spacing={0.5} flexWrap="wrap" useFlexGap sx={{ mt: 0.5 }}>
                {item.expediente_estado && <Chip label={item.expediente_estado} size="small" color={EXPEDIENTE_ESTADO_COLORS[item.expediente_estado] ?? "default"} />}
                <Chip label={ITEM_STATUS_LABELS[item.status]} size="small" color={ITEM_STATUS_COLORS[item.status]} />
              </Stack>
              {item.responsable && <Typography variant="caption" color="text.secondary" display="block">{item.responsable}</Typography>}
              {item.fecha_cierre && <Typography variant="caption" color="text.secondary" display="block">{fmtFecha(item.fecha_cierre)}</Typography>}
            </CardContent>
          </Card>
        ))}
      </Stack>
    ) : (
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
            {visibles.slice(page * rowsPerPage, page * rowsPerPage + rowsPerPage).map((item) => (
              <TableRow key={item.id_item} hover>
                <TableCell>{item.expediente_vivienda_denominacion ?? "—"}</TableCell>
                <TableCell><Typography variant="caption" fontFamily="monospace">{item.expediente.slice(0, 8).toUpperCase()}</Typography></TableCell>
                <TableCell>{item.expediente_estado ? <Chip label={item.expediente_estado} size="small" color={EXPEDIENTE_ESTADO_COLORS[item.expediente_estado] ?? "default"} /> : "—"}</TableCell>
                <TableCell><Chip label={ITEM_STATUS_LABELS[item.status]} size="small" color={ITEM_STATUS_COLORS[item.status]} /></TableCell>
                <TableCell>{item.responsable ?? "—"}</TableCell>
                <TableCell>{fmtFecha(item.fecha_cierre)}</TableCell>
                <TableCell><Typography variant="body2" noWrap sx={{ maxWidth: 240 }}>{item.comentarios || "—"}</Typography></TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </TableContainer>
    )}
    <TablePagination
      component="div"
      count={visibles.length}
      page={page}
      onPageChange={(_, p) => setPage(p)}
      rowsPerPage={rowsPerPage}
      onRowsPerPageChange={(e) => { setRowsPerPage(parseInt(e.target.value, 10)); setPage(0); }}
      rowsPerPageOptions={[10, 25, 50]}
      labelRowsPerPage="Filas:"
      labelDisplayedRows={({ from, to, count }) => `${from}–${to} de ${count}`}
    />
    </Paper>
    </>
  );
}
