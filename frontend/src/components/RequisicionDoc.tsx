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

// Misma "hoja"/documento, en blanco (18/Sep/2026, pedido de Mariana para
// /obra/requisiciones/nueva: "mantengo como si fuera hoja [pero] en
// blanco, no en negro") - el detalle (/obra/requisiciones/[id]) sigue
// usando DOC (oscuro), ese no cambio.
export const DOC_LIGHT = {
  bg: "#f5f5f5",
  panel: "#ffffff",
  panelBorder: "#e0e0e0",
  text: "#1a1a1a",
  textMuted: "#5f5f5f",
  textFaint: "#8a8a8a",
  accent: "#c9762f",
  green: "#2e7d32",
  divider: "#e0e0e0",
};

type DocTokens = typeof DOC;

// sx para TextField (incluye los selects nativos) - MUI por default asume
// fondo claro, con DOC (oscuro) hay que forzar cada color; con DOC_LIGHT
// coincide con el tema normal de la app pero se deja explicito para que
// los panels luzcan consistentes entre si.
export function buildDocFieldSx(tokens: DocTokens = DOC) {
  return {
    "& .MuiInputLabel-root": { color: tokens.textFaint },
    "& .MuiInputLabel-root.Mui-focused": { color: tokens.accent },
    "& .MuiOutlinedInput-root": {
      color: tokens.text,
      "& fieldset": { borderColor: tokens.panelBorder },
      "&:hover fieldset": { borderColor: tokens.textMuted },
      "&.Mui-focused fieldset": { borderColor: tokens.accent },
    },
    "& .MuiSelect-select, & input, & select": { color: tokens.text },
    "& option": { color: tokens === DOC ? "#000" : tokens.text },
  };
}

export const docFieldSx = buildDocFieldSx(DOC);

export function DocPanel({
  title,
  action,
  children,
  tokens = DOC,
}: {
  title: string;
  action?: React.ReactNode;
  children: React.ReactNode;
  tokens?: DocTokens;
}) {
  return (
    <Box sx={{ bgcolor: tokens.panel, border: `1px solid ${tokens.panelBorder}`, borderRadius: 2, p: 3 }}>
      <Stack direction="row" alignItems="center" sx={{ mb: 2 }}>
        <Typography sx={{ fontSize: 13, fontWeight: 600, color: tokens.text }}>{title}</Typography>
        {action && <Box sx={{ ml: "auto" }}>{action}</Box>}
      </Stack>
      {children}
    </Box>
  );
}

export function DocCampo({ label, value, tokens = DOC }: { label: string; value: string; tokens?: DocTokens }) {
  return (
    <Stack spacing={0.25}>
      <Typography sx={{ fontSize: 11, letterSpacing: 0.5, color: tokens.textFaint, textTransform: "uppercase" }}>
        {label}
      </Typography>
      <Typography sx={{ fontSize: 14, color: tokens.text, fontWeight: 600 }}>{value}</Typography>
    </Stack>
  );
}
