import EnDesarrolloPage from "@/components/EnDesarrolloPage";

// tickets.* (TICKETS_RESPONSABLE/TICKETS_PARTICIPANTE/EMPLEADO_SELF) -
// hallazgo de AppShell.test.ts (11/Ago/2026, ver docs/CumbresBI_estado.md):
// no tenia apartado dueno todavia. Fase 2+ del plan de trabajo.
export default function TicketsPage() {
  return (
    <EnDesarrolloPage
      titulo="Tickets"
      descripcion="Tickets de proyecto/centro (tickets_proyectos, tickets_centros) - responsables y participantes."
    />
  );
}
