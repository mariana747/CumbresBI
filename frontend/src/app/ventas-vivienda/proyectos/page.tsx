"use client";

import { useEffect, useState } from "react";
import { Stack, Typography } from "@mui/material";
import { Building2 } from "lucide-react";
import AppShell from "@/components/AppShell";
import { SessionUser, getSession } from "@/lib/auth";
import ProyectosTab from "../ProyectosTab";

// Fase 3, arranque de exposicion CRUD (19/Ago/2026) - un apartado por
// pantalla con su propio URL, mismo estandar que Admin (IAM)/PLD en el
// sidebar (ver AppShell.tsx::buildNavItems), no pestanas dentro de un solo
// URL.
export default function VentasViviendaProyectosPage() {
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
        <Building2 size={22} strokeWidth={1.5} />
        <Typography variant="h5">Proyectos</Typography>
      </Stack>
      <Typography variant="body2" color="text.secondary" sx={{ mb: 3 }}>
        Proyectos de vivienda (denominación, domicilio, sociedad propietaria).
      </Typography>
      <ProyectosTab puedeCrear={puedeCrear} puedeEditar={puedeEditar} actorId={actorId} />
    </AppShell>
  );
}
