"use client";

import { useState } from "react";
import { Button, Chip, Grid, Paper, Stack, Typography } from "@mui/material";
import { FileSearch, FolderOpen, UploadCloud } from "lucide-react";
import AppShell from "@/components/AppShell";
import MotorDocumentalDialog from "@/components/MotorDocumentalDialog";

// Tipos que el Motor Documental ya reconoce (docint/classifier.py) - se
// muestran aqui solo como referencia informativa para el analista, no como
// selector (la deteccion es automatica por nombre de archivo).
const SUPPORTED_DOCUMENT_TYPES = [
  "INE / IFE",
  "CURP",
  "Comprobante de domicilio",
  "Constancia de situación fiscal",
  "Acta de nacimiento",
  "Acta constitutiva",
];

// PLD / Cumplimiento - shell de Fase 0 (docs/architecture/README.md sec. 2).
// Todavia no hay expedientes ni contrapartes reales conectados (eso depende
// de pld-service); esta pantalla existe para dar un punto de entrada real al
// Motor Documental (modulo emergente, ver MotorDocumentalDialog) mientras el
// resto del modulo PLD se construye.
export default function PldPage() {
  const [open, setOpen] = useState(false);

  return (
    <AppShell>
      <Typography variant="h5" gutterBottom>
        PLD / Cumplimiento
      </Typography>
      <Typography variant="body2" color="text.secondary" sx={{ mb: 3 }}>
        Esqueleto de Fase 0 — sin expedientes conectados todavía.
      </Typography>

      <Grid container spacing={3}>
        <Grid item xs={12} md={7}>
          <Paper
            variant="outlined"
            sx={{
              p: 3,
              height: "100%",
              display: "flex",
              flexDirection: "column",
              gap: 2,
            }}
          >
            <Stack direction="row" spacing={1.5} alignItems="center">
              <FileSearch size={22} strokeWidth={1.5} color="#1C75BC" />
              <Typography variant="subtitle1" fontWeight={600}>
                Motor Documental
              </Typography>
            </Stack>
            <Typography variant="body2" color="text.secondary">
              Analiza identificaciones, comprobantes y documentos de soporte
              con IA. Puedes subir varios archivos de la misma persona a la
              vez (ej. INE, CURP y comprobante) — el tipo se detecta
              automáticamente por el nombre del archivo.
            </Typography>
            <Button
              variant="contained"
              startIcon={<UploadCloud size={18} strokeWidth={1.5} />}
              onClick={() => setOpen(true)}
              sx={{ alignSelf: "flex-start", mt: "auto" }}
            >
              Cargar documento
            </Button>
          </Paper>
        </Grid>

        <Grid item xs={12} md={5}>
          <Paper variant="outlined" sx={{ p: 3, height: "100%" }}>
            <Typography variant="subtitle1" fontWeight={600} gutterBottom>
              Tipos de documento soportados
            </Typography>
            <Stack direction="row" flexWrap="wrap" useFlexGap gap={1} sx={{ mt: 1.5 }}>
              {SUPPORTED_DOCUMENT_TYPES.map((label) => (
                <Chip key={label} label={label} size="small" variant="outlined" />
              ))}
            </Stack>
          </Paper>
        </Grid>

        <Grid item xs={12}>
          <Paper
            variant="outlined"
            sx={{
              p: 4,
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              gap: 1,
              color: "text.secondary",
            }}
          >
            <FolderOpen size={28} strokeWidth={1.5} />
            <Typography variant="body2" fontWeight={600}>
              Sin expedientes todavía
            </Typography>
            <Typography variant="caption" textAlign="center">
              Cuando pld-service esté conectado, aquí aparecerán los
              expedientes de contrapartes con sus documentos y estatus KYC.
            </Typography>
          </Paper>
        </Grid>
      </Grid>

      <MotorDocumentalDialog open={open} onClose={() => setOpen(false)} />
    </AppShell>
  );
}
