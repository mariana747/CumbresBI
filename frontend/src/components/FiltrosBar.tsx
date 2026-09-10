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
  /** Sin Paper/margen propio: para vivir pegado a la tabla dentro de un Paper compartido */
  flush?: boolean;
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
  flush = false,
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

  const contenido = (
    <>
      {/* justifyContent="space-between" en vez de ml:auto condicional en el
      grupo de acciones (10/Sep/2026, "que todos los botones como Nuevo
      Saldo se pongan hacia la derecha") - el ml:auto dependia de si habia
      children/botonEnviarMasivo y en la practica no empujaba el grupo al
      extremo derecho; con dos grupos (izquierda: buscador, derecha:
      acciones) el espacio libre siempre lo absorbe el hueco entre ambos. */}
      <Stack
        direction={{ xs: "column", md: "row" }}
        spacing={2}
        alignItems="center"
        justifyContent="space-between"
        sx={{ p: 2 }}
      >
        <Stack direction="row" spacing={1.5} alignItems="center" sx={{ minWidth: 0 }}>
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
        </Stack>

        {actions && (
          <Stack direction="row" spacing={1} sx={{ flexShrink: 0 }}>
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
    </>
  );

  if (flush) {
    return contenido;
  }

  return (
    <Paper variant="outlined" sx={{ mb: 3 }}>
      {contenido}
    </Paper>
  );
}
