import { ReactNode } from "react";
import { Box, Button, Divider, InputAdornment, Paper, Stack, TextField, Typography } from "@mui/material";
import { Mail, Search } from "lucide-react";

interface FiltrosBarProps {
  search: string;
  onSearchChange: (value: string) => void;
  searchPlaceholder?: string;
  /** Filtros adicionales */
  children?: ReactNode;
  /** Aplica los filtros */
  onAplicarFiltros?: () => void;
  /** Limpia los filtros */
  onLimpiarFiltros?: () => void;
  /** Envío masivo */
  seleccionadas?: number;
  onEnviarMasivo?: () => void;
  puedeEditar?: boolean;
  /** Acciones adicionales */
  actions?: ReactNode;
}

export default function FiltrosBar({
  search,
  onSearchChange,
  searchPlaceholder = "Buscar por folio, UUID o nombre...",
  children,
  onAplicarFiltros,
  onLimpiarFiltros,
  seleccionadas = 0,
  onEnviarMasivo,
  puedeEditar = false,
  actions,
}: FiltrosBarProps) {
  // Boton de enviar por correo
  const botonEnviarMasivo = puedeEditar && onEnviarMasivo && seleccionadas > 0 && (
    <Button
      size="small"
      variant="outlined"
      startIcon={<Mail size={14} strokeWidth={2} />}
      onClick={onEnviarMasivo}
      sx={children ? undefined : { ml: { md: "auto" } }}
    >
      Enviar por correo ({seleccionadas})
    </Button>
  );

  return (
    <Paper variant="outlined" sx={{ mb: 3 }}>
      <Stack direction={{ xs: "column", md: "row" }} spacing={2} alignItems="center" sx={{ p: 2 }}>
        <TextField
          size="small"
          placeholder={searchPlaceholder}
          value={search}
          onChange={(e) => onSearchChange(e.target.value)}
          sx={{ flex: 1, maxWidth: 320 }}
          InputProps={{
            startAdornment: (
              <InputAdornment position="start">
                <Search size={16} strokeWidth={1.5} />
              </InputAdornment>
            ),
          }}
        />

        {!children && botonEnviarMasivo}

        {actions && (
          <Stack direction="row" sx={{ ml: { md: !children && botonEnviarMasivo ? 0 : "auto" } }}>
            {actions}
          </Stack>
        )}
      </Stack>

      {children && (
        <>
          <Divider />
          {/* Fila de filtros: grid en vez de flexWrap - con flexWrap los
          campos se repartian de forma irregular en anchos intermedios
          (laptop), cada uno con su propio salto de linea. El grid reparte
          celdas de ancho parejo, todas alineadas. */}
          <Box sx={{ p: 2, pt: 1.5 }}>
            <Typography variant="body2" color="text.secondary" sx={{ mb: 1 }}>
              Filtrar por:
            </Typography>
            <Box
              sx={{
                display: "grid",
                gridTemplateColumns: { xs: "1fr", sm: "repeat(auto-fit, minmax(160px, 1fr))" },
                gap: 2,
                alignItems: "end",
              }}
            >
              {children}
            </Box>
            <Stack
              direction="row"
              spacing={1.5}
              alignItems="center"
              justifyContent="flex-end"
              sx={{ mt: 2 }}
            >
              {botonEnviarMasivo}
              {onAplicarFiltros && (
                <Button size="small" variant="contained" onClick={onAplicarFiltros} sx={{ height: 40 }}>
                  Aplicar Filtros
                </Button>
              )}
              {onLimpiarFiltros && (
                <Button size="small" variant="text" onClick={onLimpiarFiltros} sx={{ height: 40 }}>
                  Limpiar
                </Button>
              )}
            </Stack>
          </Box>
        </>
      )}

      {!children && <Divider />}
    </Paper>
  );
}
