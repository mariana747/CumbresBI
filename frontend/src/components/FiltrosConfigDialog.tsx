"use client";

import { useState } from "react";
import {
  Box,
  Button,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  IconButton,
  List,
  ListItemButton,
  ListItemText,
  Paper,
  Stack,
  Typography,
} from "@mui/material";
import { ArrowLeft, ArrowRight, ChevronDown, ChevronUp } from "lucide-react";
import { FiltroConfig } from "@/lib/useFiltrosVisibles";

interface FiltrosConfigDialogProps {
  open: boolean;
  onClose: () => void;
  todos: FiltroConfig[];
  visibles: string[];
  onSave: (visibles: string[]) => void;
}

export default function FiltrosConfigDialog({
  open,
  onClose,
  todos,
  visibles,
  onSave,
}: FiltrosConfigDialogProps) {
  // Estado local mientras el dialog está abierto
  const [derecha, setDerecha] = useState<string[]>([]);
  const [selIzq, setSelIzq] = useState<string | null>(null);
  const [selDer, setSelDer] = useState<string | null>(null);

  // Al abrir, sincronizar con el estado guardado
  function handleEntered() {
    setDerecha([...visibles]);
    setSelIzq(null);
    setSelDer(null);
  }

  const izquierda = todos
    .map((f) => f.key)
    .filter((k) => !derecha.includes(k));

  const labelDe = (key: string) => todos.find((f) => f.key === key)?.label ?? key;

  function agregar() {
    if (!selIzq) return;
    setDerecha((prev) => [...prev, selIzq]);
    setSelIzq(null);
  }

  function quitar() {
    if (!selDer) return;
    setDerecha((prev) => prev.filter((k) => k !== selDer));
    setSelDer(null);
  }

  function subir() {
    if (!selDer) return;
    setDerecha((prev) => {
      const i = prev.indexOf(selDer);
      if (i <= 0) return prev;
      const next = [...prev];
      [next[i - 1], next[i]] = [next[i], next[i - 1]];
      return next;
    });
  }

  function bajar() {
    if (!selDer) return;
    setDerecha((prev) => {
      const i = prev.indexOf(selDer);
      if (i < 0 || i >= prev.length - 1) return prev;
      const next = [...prev];
      [next[i], next[i + 1]] = [next[i + 1], next[i]];
      return next;
    });
  }

  function handleGuardar() {
    onSave(derecha);
    onClose();
  }

  const colStyle = {
    width: 200,
    height: 280,
    overflow: "auto",
    border: "1px solid",
    borderColor: "divider",
    borderRadius: 1,
  };

  return (
    <Dialog
      open={open}
      onClose={onClose}
      TransitionProps={{ onEntered: handleEntered }}
      maxWidth="sm"
      fullWidth
    >
      <DialogTitle>Personalizar filtros</DialogTitle>
      <DialogContent>
        <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
          Elige qué filtros mostrar y en qué orden aparecen.
        </Typography>
        <Stack direction="row" spacing={1.5} alignItems="center" justifyContent="center">
          {/* Columna izquierda: disponibles */}
          <Box>
            <Typography variant="caption" color="text.secondary" sx={{ mb: 0.5, display: "block" }}>
              Disponibles
            </Typography>
            <Paper variant="outlined" sx={colStyle}>
              <List dense disablePadding>
                {izquierda.length === 0 ? (
                  <ListItemButton disabled>
                    <ListItemText
                      primary="Todos activos"
                      primaryTypographyProps={{ variant: "caption", color: "text.disabled" }}
                    />
                  </ListItemButton>
                ) : (
                  izquierda.map((k) => (
                    <ListItemButton
                      key={k}
                      selected={selIzq === k}
                      onClick={() => setSelIzq(k)}
                      onDoubleClick={() => {
                        setDerecha((prev) => [...prev, k]);
                        setSelIzq(null);
                      }}
                    >
                      <ListItemText primary={labelDe(k)} />
                    </ListItemButton>
                  ))
                )}
              </List>
            </Paper>
          </Box>

          {/* Flechas centro */}
          <Stack spacing={1} alignItems="center">
            <IconButton size="small" onClick={agregar} disabled={!selIzq} title="Agregar">
              <ArrowRight size={16} strokeWidth={1.5} />
            </IconButton>
            <IconButton size="small" onClick={quitar} disabled={!selDer} title="Quitar">
              <ArrowLeft size={16} strokeWidth={1.5} />
            </IconButton>
          </Stack>

          {/* Columna derecha: visibles */}
          <Box>
            <Typography variant="caption" color="text.secondary" sx={{ mb: 0.5, display: "block" }}>
              Visibles (en orden)
            </Typography>
            <Paper variant="outlined" sx={colStyle}>
              <List dense disablePadding>
                {derecha.length === 0 ? (
                  <ListItemButton disabled>
                    <ListItemText
                      primary="Sin filtros"
                      primaryTypographyProps={{ variant: "caption", color: "text.disabled" }}
                    />
                  </ListItemButton>
                ) : (
                  derecha.map((k) => (
                    <ListItemButton
                      key={k}
                      selected={selDer === k}
                      onClick={() => setSelDer(k)}
                      onDoubleClick={() => {
                        setDerecha((prev) => prev.filter((x) => x !== k));
                        setSelDer(null);
                      }}
                    >
                      <ListItemText primary={labelDe(k)} />
                    </ListItemButton>
                  ))
                )}
              </List>
            </Paper>
          </Box>

          {/* Flechas orden */}
          <Stack spacing={1} alignItems="center">
            <IconButton size="small" onClick={subir} disabled={!selDer || derecha.indexOf(selDer) === 0} title="Subir">
              <ChevronUp size={16} strokeWidth={1.5} />
            </IconButton>
            <IconButton
              size="small"
              onClick={bajar}
              disabled={!selDer || derecha.indexOf(selDer) === derecha.length - 1}
              title="Bajar"
            >
              <ChevronDown size={16} strokeWidth={1.5} />
            </IconButton>
          </Stack>
        </Stack>
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose} size="small">
          Cancelar
        </Button>
        <Button onClick={handleGuardar} variant="contained" size="small">
          Guardar
        </Button>
      </DialogActions>
    </Dialog>
  );
}
