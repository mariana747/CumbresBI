"use client";

import { Box, Dialog, DialogContent, DialogTitle, IconButton } from "@mui/material";
import { ExternalLink, X as CloseIcon } from "lucide-react";

// Preview embebido de un documento ya subido (01/Sep/2026, pedido explicito
// de Mariana: "ver documento" en PLD debe verse en la misma pantalla, igual
// que el panel lateral del Motor Documental en Facturas/Flujos, en vez de
// abrir Drive en pestaña nueva). Reusable para cualquier endpoint que sirva
// el archivo con Content-Disposition inline y CSP frame-ancestors abierto a
// este origen (ver PldContraparteDocViewSet.ver) - no asume nada de Drive
// directamente.
export interface DocumentoPreviewDialogProps {
  open: boolean;
  onClose: () => void;
  url: string | null;
  titulo: string;
}

export default function DocumentoPreviewDialog({ open, onClose, url, titulo }: DocumentoPreviewDialogProps) {
  return (
    <Dialog open={open} onClose={onClose} fullWidth maxWidth="md">
      <DialogTitle sx={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 1 }}>
        <Box sx={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{titulo}</Box>
        <Box sx={{ display: "flex", alignItems: "center", flexShrink: 0 }}>
          {url && (
            <IconButton
              size="small"
              aria-label="Abrir en pestaña nueva"
              href={url}
              target="_blank"
              rel="noopener noreferrer"
            >
              <ExternalLink size={16} strokeWidth={1.5} />
            </IconButton>
          )}
          <IconButton onClick={onClose} size="small" aria-label="Cerrar">
            <CloseIcon size={18} strokeWidth={1.5} />
          </IconButton>
        </Box>
      </DialogTitle>
      <DialogContent dividers sx={{ p: 0 }}>
        {url && (
          <Box
            component="iframe"
            src={url}
            title={titulo}
            sx={{ width: "100%", height: "75vh", border: 0, display: "block" }}
          />
        )}
      </DialogContent>
    </Dialog>
  );
}
