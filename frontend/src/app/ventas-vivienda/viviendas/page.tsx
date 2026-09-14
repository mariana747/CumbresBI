"use client";

import { useEffect, useState } from "react";
import { Stack, Typography } from "@mui/material";
import { Home } from "lucide-react";
import AppShell from "@/components/AppShell";
import { SessionUser, getSession } from "@/lib/auth";
import ViviendasTab from "../ViviendasTab";

export default function VentasViviendaViviendasPage() {
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
        <Home size={22} strokeWidth={1.5} />
        <Typography variant="h5">Viviendas</Typography>
      </Stack>
      <Typography variant="body2" color="text.secondary" sx={{ mb: 3 }}>
        Catálogo de unidades por proyecto (m², precio, disponibilidad).
      </Typography>
      <ViviendasTab puedeCrear={puedeCrear} puedeEditar={puedeEditar} actorId={actorId} />
    </AppShell>
  );
}
