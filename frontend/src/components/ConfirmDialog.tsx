"use client";

import { Button, Dialog, DialogActions, DialogContent, DialogContentText, DialogTitle } from "@mui/material";

// Confirmacion con el diseno de la app (Dialog de MUI), en vez de
// window.confirm del navegador (28/Sep/2026, pedido explicito).
export default function ConfirmDialog({
  open,
  title,
  description,
  onConfirm,
  onCancel,
  confirmLabel = "Eliminar",
}: {
  open: boolean;
  title: string;
  description: string;
  onConfirm: () => void;
  onCancel: () => void;
  confirmLabel?: string;
}) {
  return (
    <Dialog
      open={open}
      onClose={(_, reason) => {
        // Solo cierra con el boton Cancelar, no con backdrop/escape (mismo
        // criterio que el resto de Dialogs de la app).
        if (reason !== "backdropClick" && reason !== "escapeKeyDown") onCancel();
      }}
      maxWidth="xs"
      fullWidth
    >
      <DialogTitle>{title}</DialogTitle>
      <DialogContent>
        <DialogContentText>{description}</DialogContentText>
      </DialogContent>
      <DialogActions>
        <Button onClick={onCancel}>Cancelar</Button>
        <Button onClick={onConfirm} color="error" variant="contained">
          {confirmLabel}
        </Button>
      </DialogActions>
    </Dialog>
  );
}
