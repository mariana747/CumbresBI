import { Typography } from "@mui/material";
import AppShell from "@/components/AppShell";

// Shell minimo del panel corporativo (Fase 0, Actividad 4/7). Sin datos de
// negocio ni llamadas a servicios todavia - eso llega cuando el API Gateway
// y los microservicios expongan endpoints reales (Fase 1+).
export default function HomePage() {
  return (
    <AppShell>
      <Typography variant="h5" gutterBottom>
        Panel corporativo
      </Typography>
      <Typography variant="body2" color="text.secondary">
        Esqueleto de Fase 0 - sin módulos conectados todavía.
      </Typography>
    </AppShell>
  );
}
