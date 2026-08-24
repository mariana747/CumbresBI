"use client";

// Estilo compartido del "documento" de Requisicion de materiales - colores
// fijos (no siguen el tema claro/oscuro de la app, es intencional: replica
// el mockup oscuro de Ruben aprobado 17/Ago/2026, ver
// obra-requisicion-materiales-diseno en memoria del proyecto). Se usa
// tanto en la lista/alta (/obra/requisiciones) como en el detalle
// (/obra/requisiciones/[id]) para que se vea igual en todos lados, no solo
// en la vista final.
import { Box, Stack, Typography } from "@mui/material";

export const DOC = {
  bg: "#161616",
  panel: "#1e1e1e",
  panelBorder: "#2c2c2c",
  text: "#f2f2f2",
  textMuted: "#9a9a9a",
  textFaint: "#6e6e6e",
  accent: "#e08a3c",
  green: "#3fae5c",
  divider: "#2c2c2c",
};

// sx para TextField (incluye los selects nativos) sobre fondo oscuro -
// MUI por default asume fondo claro, hay que forzar cada color.
export const docFieldSx = {
  "& .MuiInputLabel-root": { color: DOC.textFaint },
  "& .MuiInputLabel-root.Mui-focused": { color: DOC.accent },
  "& .MuiOutlinedInput-root": {
    color: DOC.text,
    "& fieldset": { borderColor: DOC.panelBorder },
    "&:hover fieldset": { borderColor: DOC.textMuted },
    "&.Mui-focused fieldset": { borderColor: DOC.accent },
  },
  "& .MuiSelect-select, & input, & select": { color: DOC.text },
  "& option": { color: "#000" },
};

export function DocPanel({
  title,
  action,
  children,
}: {
  title: string;
  action?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <Box sx={{ bgcolor: DOC.panel, border: `1px solid ${DOC.panelBorder}`, borderRadius: 2, p: 3 }}>
      <Stack direction="row" alignItems="center" sx={{ mb: 2 }}>
        <Typography sx={{ fontSize: 13, fontWeight: 600, color: DOC.text }}>{title}</Typography>
        {action && <Box sx={{ ml: "auto" }}>{action}</Box>}
      </Stack>
      {children}
    </Box>
  );
}

export function DocCampo({ label, value }: { label: string; value: string }) {
  return (
    <Stack spacing={0.25}>
      <Typography sx={{ fontSize: 11, letterSpacing: 0.5, color: DOC.textFaint, textTransform: "uppercase" }}>
        {label}
      </Typography>
      <Typography sx={{ fontSize: 14, color: DOC.text, fontWeight: 600 }}>{value}</Typography>
    </Stack>
  );
}
