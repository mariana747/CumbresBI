"use client";

import { Stack, Typography } from "@mui/material";
import { Wrench } from "lucide-react";
import AppShell from "@/components/AppShell";
import { BRAND } from "@/theme/theme";

// Placeholder compartido para los modulos que ya tienen apartado en el
// sidebar (por tener permiso real en la matriz - ver AppShell.tsx
// buildNavItems) pero cuyo backend/pantalla todavia no se construye
// (Ventas/Vivienda, Compras/Tesoreria, RRHH, Contrapartes - Fase 3/4, ver
// docs/CumbresBI_estado.md). Antes esos items estaban deshabilitados
// (href="#", no clickeables); decision de producto 11/Ago/2026: mejor
// dejarlos entrar y que la pantalla misma diga "en desarrollo" - mismo
// patron que MiCumbres (micumbres/page.tsx) desde Fase 0.
export default function EnDesarrolloPage({ titulo, descripcion }: { titulo: string; descripcion: string }) {
  return (
    <AppShell>
      <Stack spacing={2} alignItems="flex-start" sx={{ py: 4 }}>
        <Wrench size={28} strokeWidth={1.5} color={BRAND.azul} />
        <Typography variant="h5" gutterBottom>
          {titulo}
        </Typography>
        <Typography variant="body2" color="text.secondary">
          {descripcion}
        </Typography>
        <Typography variant="body2" color="text.secondary">
          Este módulo está en desarrollo — todavía no hay pantalla ni datos conectados.
        </Typography>
      </Stack>
    </AppShell>
  );
}
