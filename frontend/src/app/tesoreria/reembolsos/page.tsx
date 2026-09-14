"use client";

import { useEffect, useState } from "react";
import { Stack, Typography } from "@mui/material";
import { Receipt } from "lucide-react";
import AppShell from "@/components/AppShell";
import TicketsReembolsoAdminPanel from "@/components/TicketsReembolsoAdminPanel";
import { SessionUser, getSession } from "@/lib/auth";

// Pantalla propia (08/Sep/2026, pedido de Mariana: reorganizacion del
// sidebar de Tesoreria) - antes "Tickets de Reembolso" vivia como una
// pestaña dentro de /tesoreria/facturas (27/Ago/2026, "la revision debe
// vivir donde Tesoreria ya trabaja"); con Tesoreria dividida en secciones
// (REPORTES/OPERACIONES/FACTURACIÓN Y COMPROBANTES/CONFIGURACIÓN Y BANCOS)
// ya tiene lugar propio en OPERACIONES, junto a Solicitudes de Pago y
// Flujos - no hace falta seguir compartiendo pantalla con Facturas CFDI.
// El componente (TicketsReembolsoAdminPanel) no cambio, solo donde se monta.
export default function TesoreriaReembolsosPage() {
  const [session, setSession] = useState<SessionUser | null>(null);

  useEffect(() => {
    getSession().then(setSession);
  }, []);

  return (
    <AppShell>
      <Stack direction="row" spacing={1} alignItems="center" sx={{ mb: 1 }}>
        <Receipt size={22} strokeWidth={1.5} />
        <Typography variant="h5">Reembolsos</Typography>
      </Stack>
      <Typography variant="body2" color="text.secondary" sx={{ mb: 3 }}>
        Tickets de reembolso solicitados por empleados en MiCumbres, para revisión y pago desde
        Tesorería.
      </Typography>

      <TicketsReembolsoAdminPanel session={session} />
    </AppShell>
  );
}
