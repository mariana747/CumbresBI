import path from "path";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vitest/config";

// Primera suite de pruebas del proyecto (11/Ago/2026) - cubre la logica
// de gating por rol del sidebar/panel (ver AppShell.test.ts). Entorno
// "node" (no jsdom): las funciones que se prueban (buildNavItems, los
// helpers de lib/auth.ts) son puras, no se renderiza nada - el plugin de
// React solo hace falta para que esbuild sepa transformar el JSX que
// vive en AppShell.tsx (el archivo se importa entero aunque solo se use
// el export de buildNavItems).
export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
  test: {
    environment: "node",
  },
});
