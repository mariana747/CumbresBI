"use client";

import { Stack, Typography } from "@mui/material";
import { FileSignature } from "lucide-react";
import AppShell from "@/components/AppShell";
import VistosBuenosTab from "../VistosBuenosTab";

export default function FirmasEscriturasPage() {
  return (
    <AppShell>
      <Stack direction="row" alignItems="center" spacing={1.5} sx={{ mb: 0.5 }}>
        <FileSignature size={22} strokeWidth={1.5} />
        <Typography variant="h5">Firmas de Escrituras</Typography>
      </Stack>
      <Typography variant="body2" color="text.secondary" sx={{ mb: 3 }}>
        Visto bueno para firma de escritura por expediente.
      </Typography>
      <VistosBuenosTab
        denominacion="VISTO BUENO PARA FIRMA DE ESCRITURA"
        tabs={[
          { label: "Aprobados", value: "APROBADO" },
          { label: "Pospuestos", value: "POSPUESTO" },
          { label: "No aplica", value: "NO APLICA" },
          { label: "Todos", value: "" },
        ]}
        defaultTab="APROBADO"
      />
    </AppShell>
  );
}
