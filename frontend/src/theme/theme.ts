import { createTheme } from "@mui/material/styles";

// Tokens de marca CumbresBI - fuente de verdad pendiente en design/design-system.md
// (carpeta todavia no compartida en el repo, ver conversacion de Fase 0). Estos
// son los tokens que SI se confirmaron explicitamente por el cliente mientras
// tanto; no inventar valores adicionales (spacing, elevaciones, etc.) - cuando
// llegue design/, reconciliar este archivo contra esa fuente unica.
// Exportado para poder usar estos mismos valores fuera de sx/palette (ej.
// el prop `color` de un icono de lucide-react, que no resuelve rutas de
// tema como "primary.main") sin volver a escribir el hex a mano.
export const BRAND = {
  azul: "#1C75BC", // acciones primarias, enlaces
  charcoal: "#343741", // sidebar, encabezados
  fondoApp: "#F1F3F5",
};

// Nomenclatura de color por nivel de alcance (roles-y-permisos.md sec. 1;
// 4 niveles confirmados por Dylan - GRUPO no aplica, ver memoria de sesion
// "nivel-grupo-holding-confirmado"). Paleta propia, no reutiliza
// error/warning genericos de MUI - un Chip de alcance no es una alerta de
// error de formulario, es informacion de negocio. GLOBAL en rojo a
// proposito: es el nivel de mayor riesgo (ve todo sin filtro), debe saltar
// a la vista igual que una alerta real.
export const SCOPE_PALETTE = {
  global: "#B3261E",
  sociedad: BRAND.azul,
  proyecto: "#6750A4",
  centro: "#8A5B00",
  contrato: "#146C6C",
} as const;

export const theme = createTheme({
  palette: {
    mode: "light",
    primary: { main: BRAND.azul },
    background: { default: BRAND.fondoApp, paper: "#FFFFFF" },
    text: { primary: BRAND.charcoal },
    scopeGlobal: { main: SCOPE_PALETTE.global, contrastText: "#FFFFFF" },
    scopeSociedad: { main: SCOPE_PALETTE.sociedad, contrastText: "#FFFFFF" },
    scopeProyecto: { main: SCOPE_PALETTE.proyecto, contrastText: "#FFFFFF" },
    scopeCentro: { main: SCOPE_PALETTE.centro, contrastText: "#FFFFFF" },
    scopeContrato: { main: SCOPE_PALETTE.contrato, contrastText: "#FFFFFF" },
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

// Augmentacion de tipos de MUI: registra los 5 colores de alcance de
// arriba como ciudadanos de primera clase de la paleta, para que
// <Chip color="scopeGlobal"> (y cualquier otro componente que acepte
// `color` de la paleta) los resuelva sin castear a `any` ni escribir el
// hex de nuevo en cada pantalla.
declare module "@mui/material/styles" {
  interface Palette {
    scopeGlobal: Palette["primary"];
    scopeSociedad: Palette["primary"];
    scopeProyecto: Palette["primary"];
    scopeCentro: Palette["primary"];
    scopeContrato: Palette["primary"];
  }
  interface PaletteOptions {
    scopeGlobal?: PaletteOptions["primary"];
    scopeSociedad?: PaletteOptions["primary"];
    scopeProyecto?: PaletteOptions["primary"];
    scopeCentro?: PaletteOptions["primary"];
    scopeContrato?: PaletteOptions["primary"];
  }
}

declare module "@mui/material/Chip" {
  interface ChipPropsColorOverrides {
    scopeGlobal: true;
    scopeSociedad: true;
    scopeProyecto: true;
    scopeCentro: true;
    scopeContrato: true;
  }
}
