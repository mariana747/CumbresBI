import { Box, Stack, Typography } from "@mui/material";
import { LayoutDashboard } from "lucide-react";

// Shell minimo del panel corporativo (Fase 0, Actividad 4). Sin datos de
// negocio ni llamadas a servicios todavia - eso llega cuando el API Gateway
// y los microservicios expongan endpoints reales (Fase 1+).
export default function HomePage() {
  return (
    <Stack direction="row" sx={{ minHeight: "100vh" }}>
      <Box
        component="nav"
        sx={{
          width: 240,
          bgcolor: "#343741",
          color: "#fff",
          p: 2,
          flexShrink: 0,
        }}
      >
        <Stack direction="row" spacing={1} alignItems="center">
          <LayoutDashboard size={20} strokeWidth={1.5} />
          <Typography variant="subtitle1" fontWeight={600}>
            CumbresBI
          </Typography>
        </Stack>
      </Box>
      <Box component="main" sx={{ flex: 1, p: 4 }}>
        <Typography variant="h5" gutterBottom>
          Panel corporativo
        </Typography>
        <Typography variant="body2" color="text.secondary">
          Esqueleto de Fase 0 - sin modulos conectados todavia.
        </Typography>
      </Box>
    </Stack>
  );
}
