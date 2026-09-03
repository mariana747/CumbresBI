"use client";

import { useEffect, useState } from "react";
import {
  Alert,
  Box,
  Button,
  CircularProgress,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  FormControl,
  IconButton,
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
import { ListTree, Pencil, Plus, Trash2, X as CloseIcon } from "lucide-react";
import AppShell from "@/components/AppShell";
import { SessionUser, getSession } from "@/lib/auth";
import {
  ObraConcepto,
  ObraEtapa,
  createConcepto,
  createEtapa,
  deleteConcepto,
  deleteEtapa,
  listConceptos,
  listEtapas,
  updateConcepto,
  updateEtapa,
} from "@/lib/obra";

const FORM_ETAPA_VACIO = { numero: "", nombre: "", orden: 0 };
const FORM_CONCEPTO_VACIO = { etapa: "", numero: "", descripcion: "", maestro: "" };

// Catalogo de Etapas/Conceptos de Obra - CRUD real (a diferencia de
// /obra/avance, que solo captura estimaciones sobre este catalogo, no lo
// edita). Pantalla separada, no mezclada con la captura de avance.
export default function ObraCatalogoPage() {
  const [session, setSession] = useState<SessionUser | null>(null);
  const [etapas, setEtapas] = useState<ObraEtapa[]>([]);
  const [conceptos, setConceptos] = useState<ObraConcepto[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [etapaDialogOpen, setEtapaDialogOpen] = useState(false);
  const [editandoEtapa, setEditandoEtapa] = useState<ObraEtapa | null>(null);
  const [formEtapa, setFormEtapa] = useState(FORM_ETAPA_VACIO);

  const [conceptoDialogOpen, setConceptoDialogOpen] = useState(false);
  const [editandoConcepto, setEditandoConcepto] = useState<ObraConcepto | null>(null);
  const [formConcepto, setFormConcepto] = useState(FORM_CONCEPTO_VACIO);

  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  useEffect(() => {
    getSession().then(setSession);
  }, []);

  const puedeCrear = session?.perm_keys.includes("obra.crear") ?? false;
  const puedeEditar = session?.perm_keys.includes("obra.editar") ?? false;

  function refresh() {
    setLoading(true);
    Promise.all([listEtapas(), listConceptos()])
      .then(([e, c]) => {
        setEtapas(e);
        setConceptos(c);
      })
      .catch((err) => setError(err instanceof Error ? err.message : "Error desconocido"))
      .finally(() => setLoading(false));
  }

  useEffect(refresh, []);

  function abrirAltaEtapa() {
    setEditandoEtapa(null);
    setFormEtapa({ ...FORM_ETAPA_VACIO, orden: etapas.length });
    setFormError(null);
    setEtapaDialogOpen(true);
  }

  function abrirEdicionEtapa(etapa: ObraEtapa) {
    setEditandoEtapa(etapa);
    setFormEtapa({ numero: etapa.numero, nombre: etapa.nombre, orden: etapa.orden });
    setFormError(null);
    setEtapaDialogOpen(true);
  }

  async function handleGuardarEtapa() {
    if (!formEtapa.numero.trim() || !formEtapa.nombre.trim()) {
      setFormError("Número y nombre son requeridos.");
      return;
    }
    setSaving(true);
    setFormError(null);
    try {
      if (editandoEtapa) {
        await updateEtapa(editandoEtapa.id_etapa, formEtapa);
      } else {
        await createEtapa(formEtapa);
      }
      setEtapaDialogOpen(false);
      refresh();
    } catch (err) {
      setFormError(err instanceof Error ? err.message : "Error desconocido");
    } finally {
      setSaving(false);
    }
  }

  async function handleBorrarEtapa(etapa: ObraEtapa) {
    if (!window.confirm(`¿Borrar la etapa "${etapa.numero} ${etapa.nombre}"? Esto falla si tiene conceptos.`)) {
      return;
    }
    try {
      await deleteEtapa(etapa.id_etapa);
      refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error desconocido");
    }
  }

  function abrirAltaConcepto() {
    setEditandoConcepto(null);
    setFormConcepto({ ...FORM_CONCEPTO_VACIO, etapa: etapas[0]?.id_etapa ?? "" });
    setFormError(null);
    setConceptoDialogOpen(true);
  }

  function abrirEdicionConcepto(concepto: ObraConcepto) {
    setEditandoConcepto(concepto);
    setFormConcepto({
      etapa: concepto.etapa,
      numero: concepto.numero,
      descripcion: concepto.descripcion,
      maestro: concepto.maestro || "",
    });
    setFormError(null);
    setConceptoDialogOpen(true);
  }

  async function handleGuardarConcepto() {
    if (!formConcepto.etapa || !formConcepto.numero.trim() || !formConcepto.descripcion.trim()) {
      setFormError("Etapa, número y descripción son requeridos.");
      return;
    }
    setSaving(true);
    setFormError(null);
    try {
      if (editandoConcepto) {
        await updateConcepto(editandoConcepto.id_concepto, {
          etapa: formConcepto.etapa,
          numero: formConcepto.numero,
          descripcion: formConcepto.descripcion,
          maestro: formConcepto.maestro || null,
        });
      } else {
        await createConcepto({
          etapa: formConcepto.etapa,
          numero: formConcepto.numero,
          descripcion: formConcepto.descripcion,
          maestro: formConcepto.maestro || null,
        });
      }
      setConceptoDialogOpen(false);
      refresh();
    } catch (err) {
      setFormError(err instanceof Error ? err.message : "Error desconocido");
    } finally {
      setSaving(false);
    }
  }

  async function handleBorrarConcepto(concepto: ObraConcepto) {
    if (!window.confirm(`¿Borrar el concepto "${concepto.numero}"? Esto falla si tiene estimaciones capturadas.`)) {
      return;
    }
    try {
      await deleteConcepto(concepto.id_concepto);
      refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error desconocido");
    }
  }

  return (
    <AppShell>
      <Stack direction="row" alignItems="center" spacing={1.5} sx={{ mb: 0.5 }}>
        <ListTree size={22} strokeWidth={1.5} />
        <Typography variant="h5">Catálogo de Obra</Typography>
      </Stack>
      <Typography variant="body2" color="text.secondary" sx={{ mb: 3 }}>
        Etapas y conceptos base — de aquí se alimenta la tabla de avance en <strong>Avance</strong>. El catálogo
        de materiales vive en el módulo{" "}
        <Typography component="a" href="/obra/materiales" sx={{ color: "primary.main" }}>
          Materiales
        </Typography>
        , no aquí. El catálogo de mano de obra todavía no tiene pantalla propia.
      </Typography>

      {error && (
        <Alert severity="error" sx={{ mb: 3 }}>
          {error}
        </Alert>
      )}

      {loading ? (
        <Stack alignItems="center" sx={{ py: 4 }}>
          <CircularProgress size={20} />
        </Stack>
      ) : (
        <Stack spacing={3}>
          <Paper variant="outlined">
            <Stack direction="row" alignItems="center" spacing={2} sx={{ p: 2 }}>
              <Typography variant="subtitle1">Etapas</Typography>
              {puedeCrear && (
                <Button
                  size="small"
                  variant="contained"
                  startIcon={<Plus size={14} strokeWidth={2} />}
                  onClick={abrirAltaEtapa}
                  sx={{ ml: "auto" }}
                >
                  Nueva etapa
                </Button>
              )}
            </Stack>
            <TableContainer>
              <Table size="small">
                <TableHead>
                  <TableRow>
                    <TableCell>No.</TableCell>
                    <TableCell>Nombre</TableCell>
                    <TableCell align="center">Orden</TableCell>
                    <TableCell align="right">Acciones</TableCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {etapas.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={4} align="center" sx={{ py: 3 }}>
                        <Typography variant="body2" color="text.secondary">
                          Sin etapas registradas.
                        </Typography>
                      </TableCell>
                    </TableRow>
                  ) : (
                    etapas.map((etapa) => (
                      <TableRow key={etapa.id_etapa} hover>
                        <TableCell>{etapa.numero}</TableCell>
                        <TableCell>{etapa.nombre}</TableCell>
                        <TableCell align="center">{etapa.orden}</TableCell>
                        <TableCell align="right">
                          <IconButton
                            size="small"
                            aria-label="Editar"
                            onClick={() => abrirEdicionEtapa(etapa)}
                            disabled={!puedeEditar}
                          >
                            <Pencil size={14} strokeWidth={1.5} />
                          </IconButton>
                          <IconButton
                            size="small"
                            aria-label="Borrar"
                            onClick={() => handleBorrarEtapa(etapa)}
                            disabled={!puedeEditar}
                          >
                            <Trash2 size={14} strokeWidth={1.5} />
                          </IconButton>
                        </TableCell>
                      </TableRow>
                    ))
                  )}
                </TableBody>
              </Table>
            </TableContainer>
          </Paper>

          <Paper variant="outlined">
            <Stack direction="row" alignItems="center" spacing={2} sx={{ p: 2 }}>
              <Typography variant="subtitle1">Conceptos</Typography>
              {puedeCrear && (
                <Button
                  size="small"
                  variant="contained"
                  startIcon={<Plus size={14} strokeWidth={2} />}
                  onClick={abrirAltaConcepto}
                  disabled={etapas.length === 0}
                  sx={{ ml: "auto" }}
                >
                  Nuevo concepto
                </Button>
              )}
            </Stack>
            {/* Tabla normal en pantallas >= sm; en celular (xs) se reemplaza
            por tarjetas apiladas (ver abajo), mismo patron que tesoreria/
            flujos/page.tsx. */}
            <Box sx={{ display: { xs: "none", sm: "block" } }}>
              <TableContainer>
                <Table size="small">
                  <TableHead>
                    <TableRow>
                      <TableCell>No.</TableCell>
                      <TableCell>Etapa</TableCell>
                      <TableCell>Descripción</TableCell>
                      <TableCell>Maestro</TableCell>
                      <TableCell align="right">Acciones</TableCell>
                    </TableRow>
                  </TableHead>
                  <TableBody>
                    {conceptos.length === 0 ? (
                      <TableRow>
                        <TableCell colSpan={5} align="center" sx={{ py: 3 }}>
                          <Typography variant="body2" color="text.secondary">
                            Sin conceptos registrados.
                          </Typography>
                        </TableCell>
                      </TableRow>
                    ) : (
                      conceptos.map((concepto) => (
                        <TableRow key={concepto.id_concepto} hover>
                          <TableCell>{concepto.numero}</TableCell>
                          <TableCell>{concepto.etapa_nombre}</TableCell>
                          <TableCell sx={{ maxWidth: 420, fontSize: "0.8rem" }}>{concepto.descripcion}</TableCell>
                          <TableCell>{concepto.maestro || "—"}</TableCell>
                          <TableCell align="right">
                            <IconButton
                              size="small"
                              aria-label="Editar"
                              onClick={() => abrirEdicionConcepto(concepto)}
                              disabled={!puedeEditar}
                            >
                              <Pencil size={14} strokeWidth={1.5} />
                            </IconButton>
                            <IconButton
                              size="small"
                              aria-label="Borrar"
                              onClick={() => handleBorrarConcepto(concepto)}
                              disabled={!puedeEditar}
                            >
                              <Trash2 size={14} strokeWidth={1.5} />
                            </IconButton>
                          </TableCell>
                        </TableRow>
                      ))
                    )}
                  </TableBody>
                </Table>
              </TableContainer>
            </Box>

            {/* Tarjetas apiladas - solo celular (xs), ver comentario arriba. */}
            <Stack spacing={1.5} sx={{ display: { xs: "flex", sm: "none" }, p: 2 }}>
              {conceptos.length === 0 ? (
                <Typography variant="body2" color="text.secondary" sx={{ py: 3, textAlign: "center" }}>
                  Sin conceptos registrados.
                </Typography>
              ) : (
                conceptos.map((concepto) => (
                  <Paper key={concepto.id_concepto} variant="outlined" sx={{ p: 2 }}>
                    <Stack direction="row" justifyContent="space-between" alignItems="flex-start" spacing={1}>
                      <Stack spacing={0.25} sx={{ minWidth: 0 }}>
                        <Typography variant="subtitle2">
                          {concepto.numero} — {concepto.etapa_nombre}
                        </Typography>
                        <Typography variant="body2" sx={{ fontSize: "0.8rem" }}>
                          {concepto.descripcion}
                        </Typography>
                      </Stack>
                      <Stack direction="row" sx={{ flexShrink: 0 }}>
                        <IconButton
                          size="small"
                          aria-label="Editar"
                          onClick={() => abrirEdicionConcepto(concepto)}
                          disabled={!puedeEditar}
                        >
                          <Pencil size={14} strokeWidth={1.5} />
                        </IconButton>
                        <IconButton
                          size="small"
                          aria-label="Borrar"
                          onClick={() => handleBorrarConcepto(concepto)}
                          disabled={!puedeEditar}
                        >
                          <Trash2 size={14} strokeWidth={1.5} />
                        </IconButton>
                      </Stack>
                    </Stack>
                    <Typography variant="body2" sx={{ mt: 1 }}>
                      <strong>Maestro:</strong> {concepto.maestro || "—"}
                    </Typography>
                  </Paper>
                ))
              )}
            </Stack>
          </Paper>
        </Stack>
      )}

      <Dialog open={etapaDialogOpen} onClose={() => setEtapaDialogOpen(false)} fullWidth maxWidth="sm">
        <DialogTitle sx={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          {editandoEtapa ? `Editar etapa ${editandoEtapa.numero}` : "Nueva etapa"}
          <IconButton onClick={() => setEtapaDialogOpen(false)} size="small" aria-label="Cerrar">
            <CloseIcon size={18} strokeWidth={1.5} />
          </IconButton>
        </DialogTitle>
        <DialogContent dividers>
          {formError && (
            <Alert severity="error" sx={{ mb: 2 }}>
              {formError}
            </Alert>
          )}
          <Stack spacing={2}>
            <TextField
              size="small"
              label="Número (ej. 1.0)"
              value={formEtapa.numero}
              onChange={(e) => setFormEtapa({ ...formEtapa, numero: e.target.value })}
              fullWidth
            />
            <TextField
              size="small"
              label="Nombre"
              value={formEtapa.nombre}
              onChange={(e) => setFormEtapa({ ...formEtapa, nombre: e.target.value })}
              fullWidth
            />
            <TextField
              size="small"
              label="Orden (posición de la pestaña)"
              type="number"
              value={formEtapa.orden}
              onChange={(e) => setFormEtapa({ ...formEtapa, orden: Number(e.target.value) })}
              fullWidth
            />
          </Stack>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setEtapaDialogOpen(false)}>Cancelar</Button>
          <Button variant="contained" onClick={handleGuardarEtapa} disabled={saving}>
            {saving ? <CircularProgress size={16} /> : "Guardar"}
          </Button>
        </DialogActions>
      </Dialog>

      <Dialog open={conceptoDialogOpen} onClose={() => setConceptoDialogOpen(false)} fullWidth maxWidth="sm">
        <DialogTitle sx={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          {editandoConcepto ? `Editar concepto ${editandoConcepto.numero}` : "Nuevo concepto"}
          <IconButton onClick={() => setConceptoDialogOpen(false)} size="small" aria-label="Cerrar">
            <CloseIcon size={18} strokeWidth={1.5} />
          </IconButton>
        </DialogTitle>
        <DialogContent dividers>
          {formError && (
            <Alert severity="error" sx={{ mb: 2 }}>
              {formError}
            </Alert>
          )}
          <Stack spacing={2}>
            <FormControl size="small" fullWidth>
              <InputLabel id="etapa-concepto-label">Etapa</InputLabel>
              <Select
                labelId="etapa-concepto-label"
                label="Etapa"
                value={formConcepto.etapa}
                onChange={(e) => setFormConcepto({ ...formConcepto, etapa: e.target.value })}
              >
                {etapas.map((etapa) => (
                  <MenuItem key={etapa.id_etapa} value={etapa.id_etapa}>
                    {etapa.numero} — {etapa.nombre}
                  </MenuItem>
                ))}
              </Select>
            </FormControl>
            <TextField
              size="small"
              label="Número (ej. 1.1)"
              value={formConcepto.numero}
              onChange={(e) => setFormConcepto({ ...formConcepto, numero: e.target.value })}
              fullWidth
            />
            <TextField
              size="small"
              label="Descripción"
              value={formConcepto.descripcion}
              onChange={(e) => setFormConcepto({ ...formConcepto, descripcion: e.target.value })}
              multiline
              minRows={3}
              fullWidth
            />
            <TextField
              size="small"
              label="Maestro"
              value={formConcepto.maestro}
              onChange={(e) => setFormConcepto({ ...formConcepto, maestro: e.target.value })}
              fullWidth
            />
          </Stack>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setConceptoDialogOpen(false)}>Cancelar</Button>
          <Button variant="contained" onClick={handleGuardarConcepto} disabled={saving}>
            {saving ? <CircularProgress size={16} /> : "Guardar"}
          </Button>
        </DialogActions>
      </Dialog>
    </AppShell>
  );
}
