import EnDesarrolloPage from "@/components/EnDesarrolloPage";

// rentas.* (FINANZAS_MANAGER/CONTRALOR) - hallazgo de AppShell.test.ts
// (11/Ago/2026, ver docs/CumbresBI_estado.md): no tenia apartado dueno
// todavia (se notaba menos porque esos roles ya ven Compras/Tesoreria por
// otros permisos). Fase 4 del plan de trabajo.
export default function RentasPage() {
  return (
    <EnDesarrolloPage
      titulo="Rentas"
      descripcion="Modulo de rentas (contratos de arrendamiento) - todavia sin modelos ni pantalla propia."
    />
  );
}
