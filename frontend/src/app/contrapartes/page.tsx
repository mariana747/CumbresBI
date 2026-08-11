import EnDesarrolloPage from "@/components/EnDesarrolloPage";

// Catalogo de contrapartes (ver comentario en pld-service/pld/models.py:
// "dueno real: contrapartes-service") - todavia no existe como servicio
// propio, aunque el permiso contrapartes.leer ya se asigna en la matriz
// (ver docs/CumbresBI_estado.md Fase 2, hallazgo 11/Ago/2026).
export default function ContrapartesPage() {
  return (
    <EnDesarrolloPage
      titulo="Contrapartes"
      descripcion="Catálogo de contrapartes (personas/empresas referenciadas por los expedientes KYC de PLD)."
    />
  );
}
