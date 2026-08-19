"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

// Contrapartes ya tiene pantalla real (18/Ago/2026, arranque formal de
// Fase 4 - docs/architecture/README.md sec. 11.2 #7, "fusion definitiva"
// dentro de tesoreria-service) - ver frontend/src/app/tesoreria/contrapartes/page.tsx.
// Este archivo solo redirige, por si algun link viejo apunta aqui (el
// sidebar ya no genera este href, ver AppShell.tsx).
export default function ContrapartesRedirectPage() {
  const router = useRouter();

  useEffect(() => {
    router.replace("/tesoreria/contrapartes");
  }, [router]);

  return null;
}
