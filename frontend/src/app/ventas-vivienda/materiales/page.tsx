import EnDesarrolloPage from "@/components/EnDesarrolloPage";

// Fase 3, esqueleto de materiales-service (19/Ago/2026) - modelos y
// migracion ya existen (services/materiales-service/materiales/models.py)
// pero sin serializers/views/tests todavia, por eso esta pantalla sigue
// siendo un placeholder - mismo criterio que Compras/Tesoreria/RRHH.
export default function VentasViviendaMaterialesPage() {
  return (
    <EnDesarrolloPage
      titulo="Materiales"
      descripcion="Catálogo de materiales y mano de obra (materiales-service) — modelos listos, CRUD pendiente."
    />
  );
}
