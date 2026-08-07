"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

// Bitácora de auditoría se unificó dentro de /admin/reportes como una
// tercera pestaña (era "casi lo mismo": otro reporte de solo lectura sobre
// roles/permisos/acciones) - ver frontend/src/app/admin/reportes/page.tsx.
// Este archivo solo redirige, por si algún link viejo apunta aquí.
export default function AuditoriaRedirectPage() {
  const router = useRouter();

  useEffect(() => {
    router.replace("/admin/reportes?tab=auditoria");
  }, [router]);

  return null;
}
