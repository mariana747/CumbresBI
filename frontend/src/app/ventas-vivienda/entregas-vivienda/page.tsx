"use client";

import { Stack, Typography } from "@mui/material";
import { KeyRound } from "lucide-react";
import AppShell from "@/components/AppShell";
import VistosBuenosTab from "../VistosBuenosTab";

export default function EntregasViviendaPage() {
  return (
    <AppShell>
      <Stack direction="row" alignItems="center" spacing={1.5} sx={{ mb: 0.5 }}>
        <KeyRound size={22} strokeWidth={1.5} />
        <Typography variant="h5">Entregas de Vivienda</Typography>
      </Stack>
      <Typography variant="body2" color="text.secondary" sx={{ mb: 3 }}>
        Visto bueno para entrega de vivienda por expediente.
      </Typography>
      <VistosBuenosTab
        denominacion="VISTO BUENO PARA ENTREGA DE VIVIENDA"
        nombreArchivo="entregas-vivienda"
        tabs={[
          { label: "Aprobados", value: "APROBADO" },
          { label: "Pendientes", value: "PENDIENTE" },
          { label: "Todos", value: "" },
        ]}
        defaultTab="APROBADO"
      />
    </AppShell>
  );
}
