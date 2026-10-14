"use client";

import { useMemo, useEffect, useState } from "react";
import {
  Alert,
  Box,
  CircularProgress,
  Paper,
  Stack,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TablePagination,
  TableRow,
  TableSortLabel,
  Typography,
} from "@mui/material";
import { Store } from "lucide-react";
import AppShell from "@/components/AppShell";
import FiltrosBar from "@/components/FiltrosBar";
import { TesoreriaContraparte, listContrapartes } from "@/lib/tesoreria";

type OrdenDir = "asc" | "desc";
type OrdenCol = "referencia_pago" | "local" | "nombre_comercial" | "razon_social";

function valorOrden(c: TesoreriaContraparte, col: OrdenCol): string | number {
  if (col === "referencia_pago") return parseInt(c.referencia_pago ?? "99999", 10);
  return (c[col] ?? "").toString().toLowerCase();
}

export default function LocatariosPage() {
  // Se traen todos de un jalón (el catálogo de locatarios es pequeño, ~100)
  // para que el ordenamiento y filtros apliquen sobre el set completo y no
  // solo sobre la página actual.
  const [todos, setTodos] = useState<TesoreriaContraparte[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [ordenCol, setOrdenCol] = useState<OrdenCol>("referencia_pago");
  const [ordenDir, setOrdenDir] = useState<OrdenDir>("asc");
  const [pagina, setPagina] = useState(0);
  const [filasPorPagina, setFilasPorPagina] = useState(50);

  useEffect(() => {
    setLoading(true);
    listContrapartes(undefined, "cliente", undefined, 1, 500)
      .then((res) => setTodos(res.results))
      .catch((err) => setError(err instanceof Error ? err.message : "Error desconocido"))
      .finally(() => setLoading(false));
  }, []);

  function handleOrden(col: OrdenCol) {
    if (col === ordenCol) {
      setOrdenDir((d) => (d === "asc" ? "desc" : "asc"));
    } else {
      setOrdenCol(col);
      setOrdenDir("asc");
    }
    setPagina(0);
  }

  const termino = search.trim().toLowerCase();

  const filtrados = useMemo(() => {
    // Solo los que tienen referencia de pago — los demás son clientes
    // normales que no pertenecen a este catálogo.
    let lista = todos.filter((c) => !!c.referencia_pago);
    if (termino) {
      lista = lista.filter(
        (c) =>
          c.razon_social?.toLowerCase().includes(termino) ||
          c.rfc?.toLowerCase().includes(termino) ||
          c.nombre_comercial?.toLowerCase().includes(termino) ||
          c.local?.toLowerCase().includes(termino) ||
          c.referencia_pago?.includes(termino)
      );
    }
    return [...lista].sort((a, b) => {
      const va = valorOrden(a, ordenCol);
      const vb = valorOrden(b, ordenCol);
      const cmp = va < vb ? -1 : va > vb ? 1 : 0;
      return ordenDir === "asc" ? cmp : -cmp;
    });
  }, [todos, termino, ordenCol, ordenDir]);

  const pagina_filas = filtrados.slice(pagina * filasPorPagina, pagina * filasPorPagina + filasPorPagina);

  function cabecera(col: OrdenCol, label: string) {
    return (
      <TableCell sortDirection={ordenCol === col ? ordenDir : false}>
        <TableSortLabel
          active={ordenCol === col}
          direction={ordenCol === col ? ordenDir : "asc"}
          onClick={() => handleOrden(col)}
        >
          {label}
        </TableSortLabel>
      </TableCell>
    );
  }

  return (
    <AppShell>
      <Stack direction="row" alignItems="center" spacing={1.5} sx={{ mb: 0.5 }}>
        <Store size={22} strokeWidth={1.5} />
        <Typography variant="h5">Locatarios</Typography>
      </Stack>
      <Typography variant="body2" color="text.secondary" sx={{ mb: 3 }}>
        Clientes registrados como locatarios — referencia de pago, local y nombre comercial.
      </Typography>

      {error && (
        <Alert severity="error" sx={{ mb: 3 }}>
          {error}
        </Alert>
      )}

      <FiltrosBar
        search={search}
        onSearchChange={(v) => { setSearch(v); setPagina(0); }}
        searchPlaceholder="Buscar por razón social, RFC, local o nombre comercial..."
        onAplicarFiltros={() => setPagina(0)}
        onLimpiarFiltros={() => {
          setSearch("");
          setPagina(0);
        }}
      />

      <Paper variant="outlined">
        <Box sx={{ display: { xs: "none", sm: "block" } }}>
          <TableContainer>
            <Table size="small">
              <TableHead>
                <TableRow>
                  {cabecera("referencia_pago", "Referencia")}
                  {cabecera("local", "Local")}
                  {cabecera("nombre_comercial", "Nombre comercial")}
                  {cabecera("razon_social", "Razón social / RFC")}
                  <TableCell>Correo</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {loading ? (
                  <TableRow>
                    <TableCell colSpan={5} align="center" sx={{ py: 3 }}>
                      <CircularProgress size={20} />
                    </TableCell>
                  </TableRow>
                ) : pagina_filas.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={5} align="center" sx={{ py: 3 }}>
                      <Typography variant="body2" color="text.secondary">
                        Sin locatarios registrados.
                      </Typography>
                    </TableCell>
                  </TableRow>
                ) : (
                  pagina_filas.map((c) => (
                    <TableRow key={c.id_contraparte} hover>
                      <TableCell sx={{ fontFamily: "var(--font-mono, monospace)" }}>
                        {c.referencia_pago || "—"}
                      </TableCell>
                      <TableCell>{c.local || "—"}</TableCell>
                      <TableCell>{c.nombre_comercial || "—"}</TableCell>
                      <TableCell>
                        <Stack spacing={0}>
                          <span>{c.razon_social}</span>
                          {c.rfc && (
                            <Typography variant="caption" color="text.secondary" sx={{ fontFamily: "var(--font-mono, monospace)" }}>
                              {c.rfc}
                            </Typography>
                          )}
                        </Stack>
                      </TableCell>
                      <TableCell>{c.email || "—"}</TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </TableContainer>
        </Box>

        {/* Tarjetas en celular */}
        <Stack spacing={1.5} sx={{ display: { xs: "flex", sm: "none" }, p: 2 }}>
          {loading ? (
            <Stack alignItems="center" sx={{ py: 3 }}>
              <CircularProgress size={20} />
            </Stack>
          ) : pagina_filas.length === 0 ? (
            <Typography variant="body2" color="text.secondary" sx={{ py: 3, textAlign: "center" }}>
              Sin locatarios registrados.
            </Typography>
          ) : (
            pagina_filas.map((c) => (
              <Paper key={c.id_contraparte} variant="outlined" sx={{ p: 2 }}>
                <Stack spacing={0.5}>
                  <Typography variant="subtitle2">{c.nombre_comercial || c.razon_social}</Typography>
                  <Typography variant="body2">
                    <strong>Referencia:</strong> {c.referencia_pago || "—"}
                  </Typography>
                  <Typography variant="body2">
                    <strong>Local:</strong> {c.local || "—"}
                  </Typography>
                  <Typography variant="body2">
                    <strong>Razón social:</strong> {c.razon_social}
                  </Typography>
                  {c.rfc && (
                    <Typography variant="caption" color="text.secondary" sx={{ fontFamily: "var(--font-mono, monospace)" }}>
                      {c.rfc}
                    </Typography>
                  )}
                </Stack>
              </Paper>
            ))
          )}
        </Stack>

        <TablePagination
          component="div"
          count={filtrados.length}
          page={pagina}
          onPageChange={(_, p) => setPagina(p)}
          rowsPerPage={filasPorPagina}
          onRowsPerPageChange={(e) => {
            setFilasPorPagina(parseInt(e.target.value, 10));
            setPagina(0);
          }}
          rowsPerPageOptions={[20, 50, 100]}
          labelRowsPerPage="Filas por página"
          labelDisplayedRows={({ from, to, count }) => `${from}–${to} de ${count}`}
        />
      </Paper>
    </AppShell>
  );
}
