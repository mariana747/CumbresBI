import { createTheme } from "@mui/material/styles";

// Tokens de marca CumbresBI - fuente de verdad pendiente en design/design-system.md
// (carpeta todavia no compartida en el repo, ver conversacion de Fase 0). Estos
// son los tokens que SI se confirmaron explicitamente por el cliente mientras
// tanto; no inventar valores adicionales (spacing, elevaciones, etc.) - cuando
// llegue design/, reconciliar este archivo contra esa fuente unica.
const BRAND = {
  azul: "#1C75BC", // acciones primarias, enlaces
  charcoal: "#343741", // sidebar, encabezados
  fondoApp: "#F1F3F5",
};

export const theme = createTheme({
  palette: {
    mode: "light",
    primary: { main: BRAND.azul },
    background: { default: BRAND.fondoApp, paper: "#FFFFFF" },
    text: { primary: BRAND.charcoal },
  },
  typography: {
    fontFamily: "'DM Sans', system-ui, sans-serif",
    fontSize: 13,
    // Uso: className="font-numeric" en cualquier valor numerico/financiero
    // mostrado (montos, tasas, fechas tabulares) - ver globals.css.
  },
  shape: {
    borderRadius: 6,
  },
  components: {
    MuiButton: {
      defaultProps: { disableElevation: true },
    },
  },
});
