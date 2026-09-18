"use client";

import { useEffect, useState } from "react";
import {
  Alert,
  Autocomplete,
  Box,
  Button,
  Chip,
  CircularProgress,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  IconButton,
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
import { Building2, Plus, X as CloseIcon } from "lucide-react";
import AppShell from "@/components/AppShell";
import { SessionUser, getSession } from "@/lib/auth";
import { ViviendaProyecto, listProyectos } from "@/lib/vivienda";
import { ObraLote, crearLoteEspecial, generarLotes, listLotes } from "@/lib/obra";
import { createPresupuesto, generarPresupuestoDesdeCatalogo } from "@/lib/materiales";


// Alta de Obras por Proyecto (18/Sep/2026, diseno acordado ver
// obra-requisicion-flujo-completo-rediseno en memoria del proyecto):
// jerarquia real es Proyecto -> Obra (ObraLote, casa o especial) ->
// Presupuesto propio. Antes no habia ninguna pantalla para dar de alta
// ObraLote, solo se usaba internamente desde Avance/Evidencias.
//
// Al generar cada Obra (bloque de Manzana x Lote, o especial una por una)
// se crea de inmediato su Presupuesto y se le llena el snapshot en $0 con
// el catalogo estandar de Etapas/Conceptos (generarPresupuestoDesdeCatalogo)
// - listo para llenar montos/cantidades reales despues. El avance semanal
// por Etapa sigue siendo pantalla aparte (/obra/avance), esto no lo toca.
export default function ObraObrasPage() {
  const [session, setSession] = useState<SessionUser | null>(null);
  const [proyectos, setProyectos] = useState<ViviendaProyecto[]>([]);
  const [proyectoId, setProyectoId] = useState("");
  const [lotes, setLotes] = useState<ObraLote[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [generando, setGenerando] = useState(false);
  const [progreso, setProgreso] = useState<string | null>(null);

  const [bloqueDialogOpen, setBloqueDialogOpen] = useState(false);
  const [numManzanas, setNumManzanas] = useState("");
  const [lotesPorManzana, setLotesPorManzana] = useState("");

  const [especialDialogOpen, setEspecialDialogOpen] = useState(false);
  const [identificadorEspecial, setIdentificadorEspecial] = useState("");

  const [formError, setFormError] = useState<string | null>(null);

  useEffect(() => {
    getSession().then(setSession);
    listProyectos()
      .then(setProyectos)
      .catch((err) => setError(err instanceof Error ? err.message : "Error desconocido"));
  }, []);

  const puedeCrear = session?.perm_keys.includes("obra.crear") ?? false;

  function refrescarLotes(proyecto: string) {
    if (!proyecto) {
      setLotes([]);
      return;
    }
    setLoading(true);
    listLotes({ proyecto })
      .then(setLotes)
      .catch((err) => setError(err instanceof Error ? err.message : "Error desconocido"))
      .finally(() => setLoading(false));
  }

  useEffect(() => {
    refrescarLotes(proyectoId);
  }, [proyectoId]);

  // Comun a las dos altas (bloque y especial): crea el Presupuesto de la
  // Obra recien creada y le llena el snapshot en $0 - si un lote falla no
  // detiene a los demas, solo se reporta al final.
  async function generarPresupuestosDe(nuevosLotes: ObraLote[]) {
    for (const lote of nuevosLotes) {
      setProgreso(`Generando presupuesto de ${lote.tipo === "CASA" ? `Mz ${lote.manzana} - Lote ${lote.numero_lote}` : lote.identificador}...`);
      const presupuesto = await createPresupuesto({
        proyecto: lote.proyecto,
        obra: lote.id_lote,
        denominacion: lote.tipo === "CASA" ? `Mz ${lote.manzana} - Lote ${lote.numero_lote}` : lote.identificador,
      });
      await generarPresupuestoDesdeCatalogo(presupuesto.id_presupuesto);
    }
  }

  function abrirAltaBloque() {
    setNumManzanas("");
    setLotesPorManzana("");
    setFormError(null);
    setBloqueDialogOpen(true);
  }

  async function handleGenerarBloque() {
    const n = Number(numManzanas);
    const lotes = Number(lotesPorManzana);
    if (!proyectoId) {
      setFormError("Selecciona un proyecto primero.");
      return;
    }
    if (!n || n <= 0 || !lotes || lotes <= 0) {
      setFormError("Número de manzanas y lotes por manzana deben ser mayores a 0.");
      return;
    }
    // Nombrado automatico "Manzana 1".."Manzana N" (18/Sep/2026, "no
    // agregar una a una" - Mariana solo da 2 numeros globales: ej. 30
    // manzanas de 1 lote, o 10 manzanas de 2 lotes).
    const manzanas = Array.from({ length: n }, (_, i) => ({ manzana: `Manzana ${i + 1}`, num_lotes: lotes }));
    setGenerando(true);
    setFormError(null);
    try {
      const nuevos = await generarLotes({ proyecto: proyectoId, manzanas });
      await generarPresupuestosDe(nuevos);
      setBloqueDialogOpen(false);
      refrescarLotes(proyectoId);
    } catch (err) {
      setFormError(err instanceof Error ? err.message : "Error desconocido");
    } finally {
      setGenerando(false);
      setProgreso(null);
    }
  }

  function abrirAltaEspecial() {
    setIdentificadorEspecial("");
    setFormError(null);
    setEspecialDialogOpen(true);
  }

  async function handleGuardarEspecial() {
    if (!proyectoId) {
      setFormError("Selecciona un proyecto primero.");
      return;
    }
    if (!identificadorEspecial.trim()) {
      setFormError("El nombre de la Obra especial es requerido.");
      return;
    }
    setGenerando(true);
    setFormError(null);
    try {
      const nuevo = await crearLoteEspecial({ proyecto: proyectoId, identificador: identificadorEspecial.trim() });
      await generarPresupuestosDe([nuevo]);
      setEspecialDialogOpen(false);
      refrescarLotes(proyectoId);
    } catch (err) {
      setFormError(err instanceof Error ? err.message : "Error desconocido");
    } finally {
      setGenerando(false);
      setProgreso(null);
    }
  }

  return (
    <AppShell>
      <Stack direction="row" alignItems="center" spacing={1.5} sx={{ mb: 0.5 }}>
        <Building2 size={22} strokeWidth={1.5} />
        <Typography variant="h5">Obras por Proyecto</Typography>
      </Stack>
      <Typography variant="body2" color="text.secondary" sx={{ mb: 3 }}>
        Cada Obra (casa por Manzana/Lote, o especial como Red Hídrica/Caseta de Vigilancia) tiene su propio
        Presupuesto — se genera automáticamente al darla de alta aquí, con el catálogo estándar de Etapas/Conceptos
        en $0, listo para llenar. El avance semanal por Etapa se captura en <strong>Avance</strong>, no aquí.
      </Typography>

      {error && (
        <Alert severity="error" sx={{ mb: 3 }}>
          {error}
        </Alert>
      )}

      <Stack spacing={3}>
        <Paper variant="outlined" sx={{ p: 2 }}>
          <Stack direction={{ xs: "column", sm: "row" }} spacing={2} alignItems={{ sm: "center" }}>
            <Autocomplete
              size="small"
              sx={{ minWidth: 280 }}
              options={proyectos}
              getOptionLabel={(p) => p.alias_proyecto || p.denominacion || p.id_proyecto}
              value={proyectos.find((p) => p.id_proyecto === proyectoId) ?? null}
              onChange={(_, valor) => setProyectoId(valor?.id_proyecto ?? "")}
              isOptionEqualToValue={(a, b) => a.id_proyecto === b.id_proyecto}
              renderInput={(params) => <TextField {...params} label="Proyecto" />}
            />
            {puedeCrear && (
              <Stack direction="row" spacing={1} sx={{ ml: { sm: "auto" } }}>
                <Button
                  size="small"
                  variant="outlined"
                  startIcon={<Plus size={14} strokeWidth={2} />}
                  onClick={abrirAltaEspecial}
                  disabled={!proyectoId}
                >
                  Obra Especial
                </Button>
                <Button
                  size="small"
                  variant="contained"
                  startIcon={<Plus size={14} strokeWidth={2} />}
                  onClick={abrirAltaBloque}
                  disabled={!proyectoId}
                >
                  Generar Manzanas y Lotes
                </Button>
              </Stack>
            )}
          </Stack>
        </Paper>

        <Paper variant="outlined">
          <Stack direction="row" alignItems="center" spacing={2} sx={{ p: 2 }}>
            <Typography variant="subtitle1">Obras del Proyecto</Typography>
          </Stack>
          {loading ? (
            <Stack alignItems="center" sx={{ py: 4 }}>
              <CircularProgress size={20} />
            </Stack>
          ) : (
            <TableContainer>
              <Table size="small">
                <TableHead>
                  <TableRow>
                    <TableCell>Tipo</TableCell>
                    {/* No. de Casa (18/Sep/2026) - numeracion corrida de
                    todas las CASA del proyecto (1, 2, 3...), sin importar
                    manzana - distinta de "Lote" (que reinicia en 1 dentro
                    de cada manzana). Vacia para ESPECIAL. */}
                    <TableCell align="right">No. Casa</TableCell>
                    <TableCell>Manzana</TableCell>
                    <TableCell>Lote</TableCell>
                    <TableCell>Identificador</TableCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {!proyectoId ? (
                    <TableRow>
                      <TableCell colSpan={5} align="center" sx={{ py: 3 }}>
                        <Typography variant="body2" color="text.secondary">
                          Selecciona un proyecto para ver sus Obras.
                        </Typography>
                      </TableCell>
                    </TableRow>
                  ) : lotes.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={5} align="center" sx={{ py: 3 }}>
                        <Typography variant="body2" color="text.secondary">
                          Este proyecto todavía no tiene Obras registradas.
                        </Typography>
                      </TableCell>
                    </TableRow>
                  ) : (
                    (() => {
                      let numCasa = 0;
                      return lotes.map((l) => {
                        if (l.tipo === "CASA") numCasa += 1;
                        return (
                          <TableRow key={l.id_lote} hover>
                            <TableCell>
                              <Chip size="small" label={l.tipo === "CASA" ? "Casa" : "Especial"} />
                            </TableCell>
                            <TableCell align="right">{l.tipo === "CASA" ? numCasa : "—"}</TableCell>
                            <TableCell>{l.tipo === "CASA" ? l.manzana : "—"}</TableCell>
                            <TableCell>{l.tipo === "CASA" ? l.numero_lote : "—"}</TableCell>
                            <TableCell>{l.identificador || "—"}</TableCell>
                          </TableRow>
                        );
                      });
                    })()
                  )}
                </TableBody>
              </Table>
            </TableContainer>
          )}
        </Paper>
      </Stack>

      <Dialog open={bloqueDialogOpen} onClose={() => !generando && setBloqueDialogOpen(false)} fullWidth maxWidth="sm">
        <DialogTitle sx={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          Generar Manzanas y Lotes
          <IconButton onClick={() => setBloqueDialogOpen(false)} size="small" aria-label="Cerrar" disabled={generando}>
            <CloseIcon size={18} strokeWidth={1.5} />
          </IconButton>
        </DialogTitle>
        <DialogContent dividers>
          <Typography variant="caption" color="text.secondary">
            Ej. 30 manzanas de 1 lote cada una, o 10 manzanas de 2 lotes cada una — se nombran solas
            (Manzana 1, Manzana 2...) y se crea una Obra por cada Manzana×Lote.
          </Typography>
          {formError && (
            <Alert severity="error" sx={{ mt: 2 }}>
              {formError}
            </Alert>
          )}
          <Stack direction="row" spacing={2} sx={{ mt: 2 }}>
            <TextField
              size="small"
              label="Número de manzanas"
              type="number"
              value={numManzanas}
              onChange={(e) => setNumManzanas(e.target.value)}
              fullWidth
            />
            <TextField
              size="small"
              label="Lotes por manzana"
              type="number"
              value={lotesPorManzana}
              onChange={(e) => setLotesPorManzana(e.target.value)}
              fullWidth
            />
          </Stack>
          {progreso && (
            <Stack direction="row" spacing={1} alignItems="center" sx={{ mt: 2 }}>
              <CircularProgress size={14} />
              <Typography variant="caption" color="text.secondary">
                {progreso}
              </Typography>
            </Stack>
          )}
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setBloqueDialogOpen(false)} disabled={generando}>
            Cancelar
          </Button>
          <Button variant="contained" onClick={handleGenerarBloque} disabled={generando}>
            {generando ? <CircularProgress size={16} /> : "Generar"}
          </Button>
        </DialogActions>
      </Dialog>

      <Dialog open={especialDialogOpen} onClose={() => !generando && setEspecialDialogOpen(false)} fullWidth maxWidth="xs">
        <DialogTitle sx={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          Nueva Obra Especial
          <IconButton onClick={() => setEspecialDialogOpen(false)} size="small" aria-label="Cerrar" disabled={generando}>
            <CloseIcon size={18} strokeWidth={1.5} />
          </IconButton>
        </DialogTitle>
        <DialogContent dividers>
          <Typography variant="caption" color="text.secondary">
            Para lo que no es casa dentro de este proyecto, ej. Red Hídrica, Caseta de Vigilancia.
          </Typography>
          {formError && (
            <Alert severity="error" sx={{ mt: 2 }}>
              {formError}
            </Alert>
          )}
          <TextField
            size="small"
            label="Nombre de la Obra"
            value={identificadorEspecial}
            onChange={(e) => setIdentificadorEspecial(e.target.value)}
            fullWidth
            sx={{ mt: 2 }}
            autoFocus
          />
          {progreso && (
            <Stack direction="row" spacing={1} alignItems="center" sx={{ mt: 2 }}>
              <CircularProgress size={14} />
              <Typography variant="caption" color="text.secondary">
                {progreso}
              </Typography>
            </Stack>
          )}
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setEspecialDialogOpen(false)} disabled={generando}>
            Cancelar
          </Button>
          <Button variant="contained" onClick={handleGuardarEspecial} disabled={generando}>
            {generando ? <CircularProgress size={16} /> : "Guardar"}
          </Button>
        </DialogActions>
      </Dialog>
    </AppShell>
  );
}
