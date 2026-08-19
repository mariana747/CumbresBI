import EnDesarrolloPage from "@/components/EnDesarrolloPage";

// Fase 3, esqueleto de materiales-service (19/Ago/2026) - modelos
// Presupuesto/ConceptoPresupuesto/PresupuestoFirma ya existen
// (services/materiales-service/materiales/models.py) pero sin
// serializers/views/tests todavia, por eso esta pantalla sigue siendo un
// placeholder - mismo criterio que Compras/Tesoreria/RRHH.
export default function VentasViviendaPresupuestosPage() {
  return (
    <EnDesarrolloPage
      titulo="Presupuestos"
      descripcion="Motor de presupuesto (etapa → concepto → precio unitario, firmas) — modelos listos, CRUD pendiente."
    />
  );
}
