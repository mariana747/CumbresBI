"use client";

import { Paper, Stack, Switch, Typography } from "@mui/material";
import { type LucideIcon } from "lucide-react";

// Tarjeta con icono + switch para campos Y/N de un formulario (25/Ago/2026,
// tesoreria/flujos) - extraido a componente compartido para reusarse en
// Contratos (y cualquier otro formulario que necesite el mismo look), en
// vez de un Checkbox plano suelto.
export function ToggleCard({
  icon: Icon,
  title,
  description,
  checked,
  onChange,
  disabled,
}: {
  icon: LucideIcon;
  title: string;
  description: string;
  checked: boolean;
  onChange: (checked: boolean) => void;
  disabled?: boolean;
}) {
  return (
    <Paper
      variant="outlined"
      sx={{
        p: 1.5,
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        borderColor: checked ? "primary.main" : "divider",
        opacity: disabled ? 0.6 : 1,
      }}
    >
      <Stack direction="row" spacing={1.5} alignItems="center" sx={{ color: checked ? "primary.main" : "text.secondary" }}>
        <Icon size={18} strokeWidth={1.5} />
        <Stack spacing={0}>
          <Typography variant="body2" color="text.primary">
            {title}
          </Typography>
          <Typography variant="caption" color="text.secondary">
            {description}
          </Typography>
        </Stack>
      </Stack>
      <Switch checked={checked} disabled={disabled} onChange={(e) => onChange(e.target.checked)} />
    </Paper>
  );
}
