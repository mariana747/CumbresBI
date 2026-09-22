"use client";

import { Suspense } from "react";
import { useSearchParams } from "next/navigation";
import AppShell from "@/components/AppShell";
import CotizacionesPanel from "@/components/CotizacionesPanel";

// Fase 4B - Compras (02/Sep/2026). El contenido real vive en
// CotizacionesPanel (21/Sep/2026, extraido para reusarse tambien en el
// Drawer lateral que abre /compras/solicitudes).
function CotizacionesPageInner() {
  const searchParams = useSearchParams();
  const solicitudId = searchParams.get("solicitud") || undefined;

  return (
    <AppShell>
      <CotizacionesPanel solicitudId={solicitudId} mostrarEncabezado />
    </AppShell>
  );
}

export default function CotizacionesPage() {
  return (
    <Suspense fallback={null}>
      <CotizacionesPageInner />
    </Suspense>
  );
}
