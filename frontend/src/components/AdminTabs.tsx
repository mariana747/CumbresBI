"use client";

import { Tabs, Tab } from "@mui/material";
import { usePathname, useRouter } from "next/navigation";

// Pestañas de Admin (IAM) - agrupa pantallas que antes vivian como items
// sueltos del sidebar (Usuarios, Bitácora de auditoría, Magic Links). Son
// todas capacidades de IAM, no modulos de negocio propios como PLD o
// Ventas, por eso comparten un solo espacio en la navegacion principal
// (ver AppShell.tsx, un solo item "Admin (IAM)") y se distinguen aqui
// adentro con pestañas.
const ADMIN_TABS = [
  { label: "Usuarios", value: "/admin/usuarios" },
  { label: "Bitácora de auditoría", value: "/admin/auditoria" },
  { label: "Magic Links", value: "/admin/magic-links" },
] as const;

export default function AdminTabs() {
  const pathname = usePathname();
  const router = useRouter();

  return (
    <Tabs
      value={pathname}
      onChange={(_, value) => router.push(value)}
      sx={{ mb: 3, borderBottom: 1, borderColor: "divider" }}
    >
      {ADMIN_TABS.map((tab) => (
        <Tab key={tab.value} label={tab.label} value={tab.value} />
      ))}
    </Tabs>
  );
}
