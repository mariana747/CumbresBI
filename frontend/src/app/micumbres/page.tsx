import { Button, Stack, Typography } from "@mui/material";
import { Receipt } from "lucide-react";
import Link from "next/link";
import AppShell from "@/components/AppShell";

// Portal de autoservicio MiCumbres (plan de trabajo Fase 5, Semana 24):
// perfil del colaborador, documentos propios, historial. Shell de Fase 0 -
// mismo AppShell que el panel corporativo (mismo login, alcance IDENTIDAD
// distinto - ver roles-y-permisos.md sec. 1, rol EMPLEADO_SELF) hasta que
// se defina si amerita un layout propio en Fase 5.
export default function MiCumbresPage() {
  return (
    <AppShell>
      <Typography variant="h5" gutterBottom>
        MiCumbres
      </Typography>
      <Typography variant="body2" color="text.secondary" sx={{ mb: 3 }}>
        Portal de autoservicio del colaborador — esqueleto de Fase 0, sin
        datos conectados todavía (llega en Fase 5, RRHH y Talento).
      </Typography>

      {/* Tickets de reembolso (27/Ago/2026) - unica pieza real hoy,
          pantalla provisional sobre tesoreria-service mientras no exista
          rrhh-service, ver memoria de sesion
          "rrhh-mi-cumbres-y-modulo-pendiente". */}
      <Stack direction="row">
        <Button component={Link} href="/micumbres/tickets" variant="outlined" startIcon={<Receipt size={18} strokeWidth={1.5} />}>
          Tickets de Reembolso
        </Button>
      </Stack>
    </AppShell>
  );
}
