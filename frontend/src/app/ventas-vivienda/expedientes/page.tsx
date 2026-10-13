"use client";

import { Suspense, useEffect, useState } from "react";
import { CircularProgress, Stack, Typography } from "@mui/material";
import { ClipboardList } from "lucide-react";
import AppShell from "@/components/AppShell";
import { SessionUser, getSession } from "@/lib/auth";
import ExpedientesTab from "../ExpedientesTab";

export default function VentasViviendaExpedientesPage() {
  const [session, setSession] = useState<SessionUser | null>(null);

  useEffect(() => {
    getSession().then(setSession);
  }, []);

  const puedeCrear = session?.perm_keys.includes("ventas-vivienda.crear") ?? false;
  const puedeEditar = session?.perm_keys.includes("ventas-vivienda.editar") ?? false;
  const actorId = session?.user_id ?? "desconocido";

  return (
    <AppShell>
      <Stack direction="row" alignItems="center" spacing={1.5} sx={{ mb: 0.5 }}>
        <ClipboardList size={22} strokeWidth={1.5} />
        <Typography variant="h5">Expedientes</Typography>
      </Stack>
      <Typography variant="body2" color="text.secondary" sx={{ mb: 3 }}>
        Expedientes de venta (vivienda + asesor + contrato de Tesorería).
      </Typography>
      <Suspense fallback={<CircularProgress size={24} sx={{ mt: 2 }} />}>
        <ExpedientesTab puedeCrear={puedeCrear} puedeEditar={puedeEditar} actorId={actorId} />
      </Suspense>
    </AppShell>
  );
}
