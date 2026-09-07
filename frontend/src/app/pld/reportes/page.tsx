"use client";

import { useEffect, useState } from "react";
import {
  Alert,
  Button,
  Chip,
  CircularProgress,
  Paper,
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
import { AlertTriangle, BarChart3, Download, FileSpreadsheet, FileWarning, ShieldAlert } from "lucide-react";
import AppShell from "@/components/AppShell";
import { BRAND } from "@/theme/theme";
import {
  CATEGORIA_CUMPLIMIENTO_LABELS,
  PldReportesCumplimiento,
  descargarExcelCumplimiento,
  getReportesCumplimiento,
} from "@/lib/pld";

// Dashboard interno de cumplimiento PLD/AML (07/Sep/2026) - v1 con los
// datos que YA existen en pld-service, sin depender del proveedor externo
// de KYC/AML todavia sin elegir (ver docs/architecture/pld-fase2-alcance.md
// sec. 7). 4 bloques: resumen por categoria/estado, documentos pendientes
// (obligatorios sin archivo o vencidos), cuentas en riesgo (sospechosa/
// congelada) y expedientes viejos sin aprobar.
const ESTADO_LABELS: Record<string, string> = {
  PENDIENTE: "Pendiente",
  INCOMPLETO: "Incompleto",
  ENTREGADO: "Entregado",
};

function celdaCsv(valor: string | number | boolean) {
  const texto = String(valor ?? "");
  return /[",\n]/.test(texto) ? `"${texto.replace(/"/g, '""')}"` : texto;
}

function descargarCsv(nombreArchivo: string, encabezados: string[], filas: (string | number | boolean)[][]) {
  const csv =
    "﻿" +
    [encabezados, ...filas].map((fila) => fila.map(celdaCsv).join(",")).join("\r\n");
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = nombreArchivo;
  link.click();
  URL.revokeObjectURL(url);
}

export default function ReportesPldPage() {
  const [datos, setDatos] = useState<PldReportesCumplimiento | null>(null);
  const [dias, setDias] = useState(30);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [descargandoExcel, setDescargandoExcel] = useState(false);

  async function handleDescargarExcel() {
    setDescargandoExcel(true);
    try {
      await descargarExcelCumplimiento();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error al descargar el Excel");
    } finally {
      setDescargandoExcel(false);
    }
  }

  function cargar() {
    setLoading(true);
    setError(null);
    getReportesCumplimiento(dias)
      .then(setDatos)
      .catch((err) => setError(err instanceof Error ? err.message : "Error al cargar los reportes"))
      .finally(() => setLoading(false));
  }

  useEffect(() => {
    const timeout = setTimeout(cargar, 300);
    return () => clearTimeout(timeout);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dias]);

  return (
    <AppShell>
      <Stack spacing={4}>
        {/* 07/Sep/2026: "el espacio esta muy junto" - le faltaba minWidth:0
        al hijo dentro del Stack row (default flexbox no encoge sin eso),
        el texto se salia de la pantalla en vez de hacer wrap. Mas spacing
        general (3->4) entre el header y la primera tarjeta. */}
        <Stack direction="row" justifyContent="space-between" alignItems="flex-start" flexWrap="wrap" spacing={2}>
          <Stack spacing={0.5} sx={{ minWidth: 0, flex: "1 1 320px" }}>
            <Typography variant="h5" fontWeight={700}>
              Reportes de cumplimiento PLD/AML
            </Typography>
            <Typography variant="body2" color="text.secondary">
              Vista interna con los datos ya capturados en los expedientes — no sustituye un
              reporte regulatorio ante autoridad (UIF/CNBV), que requiere un proveedor externo de
              KYC/AML todavía sin elegir.
            </Typography>
          </Stack>
          {/* Export estructurado de 3 pestañas para auditores/desarrolladores
          (07/Sep/2026) - Resumen_KYC, Detalle_Screening, Beneficiarios_Finales.
          Nivel_Riesgo y el screening SIEMPRE dicen "Sin evaluar"/"Sin
          verificar" (nunca "limpio" o un numero inventado) mientras no haya
          proveedor externo de KYC/AML conectado. */}
          <Button
            variant="contained"
            startIcon={
              descargandoExcel ? <CircularProgress size={16} color="inherit" /> : <FileSpreadsheet size={16} strokeWidth={1.5} />
            }
            disabled={descargandoExcel}
            onClick={handleDescargarExcel}
          >
            Exportar Excel (3 pestañas)
          </Button>
        </Stack>

        {error && <Alert severity="error">{error}</Alert>}

        {loading ? (
          <Stack alignItems="center" sx={{ py: 6 }}>
            <CircularProgress />
          </Stack>
        ) : (
          datos && (
            <>
              {/* 1. Resumen por categoria x estado */}
              <Paper variant="outlined" sx={{ p: 3 }}>
                <Stack direction="row" spacing={1.5} alignItems="center" justifyContent="space-between" sx={{ mb: 2 }}>
                  <Stack direction="row" spacing={1.5} alignItems="center">
                    <BarChart3 size={20} strokeWidth={1.5} color={BRAND.azul} />
                    <Typography variant="subtitle1" fontWeight={600}>
                      Resumen de expedientes
                    </Typography>
                  </Stack>
                  <Button
                    size="small"
                    startIcon={<Download size={16} strokeWidth={1.5} />}
                    onClick={() =>
                      descargarCsv(
                        "resumen_expedientes.csv",
                        ["Categoría", "Estado", "Total"],
                        datos.resumen_por_categoria_estado.map((f) => [
                          f.categoria_cumplimiento
                            ? CATEGORIA_CUMPLIMIENTO_LABELS[f.categoria_cumplimiento]
                            : "Sin clasificar",
                          ESTADO_LABELS[f.estado_llenado] ?? f.estado_llenado,
                          f.total,
                        ])
                      )
                    }
                  >
                    Exportar CSV
                  </Button>
                </Stack>
                {datos.resumen_por_categoria_estado.length === 0 ? (
                  <Typography variant="body2" color="text.secondary">
                    Sin expedientes todavía.
                  </Typography>
                ) : (
                  <TableContainer>
                    <Table size="small">
                      <TableHead>
                        <TableRow>
                          <TableCell>Categoría</TableCell>
                          <TableCell>Estado</TableCell>
                          <TableCell align="right">Total</TableCell>
                        </TableRow>
                      </TableHead>
                      <TableBody>
                        {datos.resumen_por_categoria_estado.map((f, i) => (
                          <TableRow key={i}>
                            <TableCell>
                              <Chip
                                size="small"
                                label={
                                  f.categoria_cumplimiento
                                    ? CATEGORIA_CUMPLIMIENTO_LABELS[f.categoria_cumplimiento]
                                    : "Sin clasificar"
                                }
                              />
                            </TableCell>
                            <TableCell>{ESTADO_LABELS[f.estado_llenado] ?? f.estado_llenado}</TableCell>
                            <TableCell align="right">{f.total}</TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </TableContainer>
                )}
              </Paper>

              {/* 2. Documentos pendientes/vencidos */}
              <Paper variant="outlined" sx={{ p: 3 }}>
                <Stack direction="row" spacing={1.5} alignItems="center" justifyContent="space-between" sx={{ mb: 2 }}>
                  <Stack direction="row" spacing={1.5} alignItems="center">
                    <FileWarning size={20} strokeWidth={1.5} color={BRAND.azul} />
                    <Typography variant="subtitle1" fontWeight={600}>
                      Documentos pendientes o vencidos
                    </Typography>
                  </Stack>
                  <Button
                    size="small"
                    startIcon={<Download size={16} strokeWidth={1.5} />}
                    disabled={datos.documentos_pendientes.length === 0}
                    onClick={() =>
                      descargarCsv(
                        "documentos_pendientes.csv",
                        ["Contraparte", "Documento", "Vencido", "Fecha de vencimiento", "Tiene archivo"],
                        datos.documentos_pendientes.map((d) => [
                          d.id_contraparte,
                          d.tipo_documento ?? "Sin tipo",
                          d.vencido ? "Sí" : "No",
                          d.fecha_vencimiento ?? "",
                          d.tiene_archivo ? "Sí" : "No",
                        ])
                      )
                    }
                  >
                    Exportar CSV
                  </Button>
                </Stack>
                {datos.documentos_pendientes.length === 0 ? (
                  <Typography variant="body2" color="text.secondary">
                    Sin documentos pendientes u obligatorios sin archivo.
                  </Typography>
                ) : (
                  <TableContainer>
                    <Table size="small">
                      <TableHead>
                        <TableRow>
                          <TableCell>Contraparte</TableCell>
                          <TableCell>Documento</TableCell>
                          <TableCell>Motivo</TableCell>
                        </TableRow>
                      </TableHead>
                      <TableBody>
                        {datos.documentos_pendientes.map((d, i) => (
                          <TableRow key={i}>
                            <TableCell>{d.id_contraparte}</TableCell>
                            <TableCell>{d.tipo_documento ?? "Sin tipo"}</TableCell>
                            <TableCell>
                              {d.vencido ? (
                                <Chip
                                  size="small"
                                  color="error"
                                  label={`Vencido${d.fecha_vencimiento ? ` (${d.fecha_vencimiento})` : ""}`}
                                />
                              ) : (
                                <Chip size="small" color="warning" label="Obligatorio sin archivo" />
                              )}
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </TableContainer>
                )}
              </Paper>

              {/* 3. Cuentas en riesgo */}
              <Paper variant="outlined" sx={{ p: 3 }}>
                <Stack direction="row" spacing={1.5} alignItems="center" justifyContent="space-between" sx={{ mb: 2 }}>
                  <Stack direction="row" spacing={1.5} alignItems="center">
                    <ShieldAlert size={20} strokeWidth={1.5} color={BRAND.azul} />
                    <Typography variant="subtitle1" fontWeight={600}>
                      Cuentas en riesgo
                    </Typography>
                  </Stack>
                  <Button
                    size="small"
                    startIcon={<Download size={16} strokeWidth={1.5} />}
                    disabled={datos.cuentas_en_riesgo.length === 0}
                    onClick={() =>
                      descargarCsv(
                        "cuentas_en_riesgo.csv",
                        ["Contraparte", "Nombre", "Estado", "Actualizado"],
                        datos.cuentas_en_riesgo.map((c) => [
                          c.id_contraparte,
                          c.nombre_completo ?? "",
                          c.estado_cuenta,
                          new Date(c.actualizado_en).toLocaleString("es-MX"),
                        ])
                      )
                    }
                  >
                    Exportar CSV
                  </Button>
                </Stack>
                {datos.cuentas_en_riesgo.length === 0 ? (
                  <Typography variant="body2" color="text.secondary">
                    Sin cuentas sospechosas o congeladas.
                  </Typography>
                ) : (
                  <TableContainer>
                    <Table size="small">
                      <TableHead>
                        <TableRow>
                          <TableCell>Contraparte</TableCell>
                          <TableCell>Nombre</TableCell>
                          <TableCell>Estado</TableCell>
                          <TableCell>Actualizado</TableCell>
                        </TableRow>
                      </TableHead>
                      <TableBody>
                        {datos.cuentas_en_riesgo.map((c) => (
                          <TableRow key={c.id_kyc}>
                            <TableCell>{c.id_contraparte}</TableCell>
                            <TableCell>{c.nombre_completo || "—"}</TableCell>
                            <TableCell>
                              <Chip
                                size="small"
                                color={c.estado_cuenta === "CONGELADA" ? "error" : "warning"}
                                label={c.estado_cuenta === "CONGELADA" ? "Congelada" : "Sospechosa"}
                              />
                            </TableCell>
                            <TableCell>{new Date(c.actualizado_en).toLocaleString("es-MX")}</TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </TableContainer>
                )}
              </Paper>

              {/* 4. Expedientes sin aprobar por antiguedad */}
              <Paper variant="outlined" sx={{ p: 3 }}>
                <Stack direction="row" spacing={1.5} alignItems="center" justifyContent="space-between" sx={{ mb: 2 }}>
                  <Stack direction="row" spacing={1.5} alignItems="center">
                    <AlertTriangle size={20} strokeWidth={1.5} color={BRAND.azul} />
                    <Typography variant="subtitle1" fontWeight={600}>
                      Expedientes sin aprobar
                    </Typography>
                  </Stack>
                  <Stack direction="row" spacing={1.5} alignItems="center">
                    <TextField
                      size="small"
                      type="number"
                      label="Más de X días"
                      value={dias}
                      onChange={(e) => setDias(Number(e.target.value) || 0)}
                      sx={{ width: 140 }}
                      inputProps={{ min: 1 }}
                    />
                    <Button
                      size="small"
                      startIcon={<Download size={16} strokeWidth={1.5} />}
                      disabled={datos.expedientes_sin_aprobar.length === 0}
                      onClick={() =>
                        descargarCsv(
                          "expedientes_sin_aprobar.csv",
                          ["Contraparte", "Nombre", "Sociedad", "Creado", "Días sin aprobar"],
                          datos.expedientes_sin_aprobar.map((e) => [
                            e.id_contraparte,
                            e.nombre_completo ?? "",
                            e.sociedad_nombre ?? "",
                            new Date(e.creado_en).toLocaleDateString("es-MX"),
                            e.dias_sin_aprobar,
                          ])
                        )
                      }
                    >
                      Exportar CSV
                    </Button>
                  </Stack>
                </Stack>
                {datos.expedientes_sin_aprobar.length === 0 ? (
                  <Typography variant="body2" color="text.secondary">
                    Sin expedientes que lleven más de {dias} días sin aprobar.
                  </Typography>
                ) : (
                  <TableContainer>
                    <Table size="small">
                      <TableHead>
                        <TableRow>
                          <TableCell>Contraparte</TableCell>
                          <TableCell>Nombre</TableCell>
                          <TableCell>Sociedad</TableCell>
                          <TableCell>Creado</TableCell>
                          <TableCell align="right">Días sin aprobar</TableCell>
                        </TableRow>
                      </TableHead>
                      <TableBody>
                        {datos.expedientes_sin_aprobar.map((e) => (
                          <TableRow key={e.id_kyc}>
                            <TableCell>{e.id_contraparte}</TableCell>
                            <TableCell>{e.nombre_completo || "—"}</TableCell>
                            <TableCell>{e.sociedad_nombre || "—"}</TableCell>
                            <TableCell>{new Date(e.creado_en).toLocaleDateString("es-MX")}</TableCell>
                            <TableCell align="right">
                              <Chip size="small" color="error" label={e.dias_sin_aprobar} />
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </TableContainer>
                )}
              </Paper>
            </>
          )
        )}
      </Stack>
    </AppShell>
  );
}
