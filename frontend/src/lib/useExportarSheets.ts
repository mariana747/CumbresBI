"use client";

import { useEffect, useState } from "react";
import { elegirCarpetaDrive } from "./googleFolderPicker";
import { ExportarSheetsResultado } from "./tesoreria";

const CLAVE_CARPETA_PENDIENTE = "cumbresbi_sheets_carpeta_pendiente";

// Hook reusable para "Exportar a Google Sheets" (14/Sep/2026, "ya no se
// descargara ni CSV ni Excel, se guardara en su drive personal" +
// "dejar que ellos puedan escoger donde guardar") - reune la logica de UI
// comun a CUALQUIER pantalla que exporte asi (Flujos hoy, Facturas/
// Conciliacion despues): abrir el selector de carpeta, estado de carga/
// error, y que hacer con el resultado (redirigir a conectar cuenta, o
// abrir la hoja creada). Cada pantalla solo aporta su propia funcion de
// fetch (ej. exportarFlujosSheets en lib/tesoreria.ts), que ya trae sus
// propios filtros/columnas - este hook no sabe nada de eso.
export function useExportarSheets(exportar: (carpetaId?: string) => Promise<ExportarSheetsResultado>) {
  const [exportando, setExportando] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function ejecutar(carpetaId: string | undefined) {
    setExportando(true);
    setError(null);
    try {
      const resultado = await exportar(carpetaId);
      if (!resultado.conectado) {
        // Sin cuenta de Google conectada todavia - se manda a la pantalla
        // de consentimiento. La carpeta ya elegida se guarda (14/Sep/2026,
        // "dejar que ellos puedan escoger donde guardar" - que no se
        // pierda por tener que conectar la cuenta a medio camino) para
        // reusarla sola al volver, sin preguntar otra vez.
        if (resultado.url_autorizacion) {
          if (carpetaId) sessionStorage.setItem(CLAVE_CARPETA_PENDIENTE, carpetaId);
          window.location.href = resultado.url_autorizacion;
        } else {
          setError("No se pudo iniciar la conexión con Google.");
        }
        return;
      }
      if (resultado.url) {
        window.open(resultado.url, "_blank");
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error desconocido");
    } finally {
      setExportando(false);
    }
  }

  // Retomar tras volver de conectar la cuenta (14/Sep/2026) - el callback
  // de iam-service regresa con ?google_sheets=conectado en la URL (ver
  // iam/google_personal_views.py::_url_retorno); si ademas hay una
  // carpeta pendiente guardada arriba, se completa el export solo, sin
  // volver a pedir carpeta ni que el usuario le de "Exportar" de nuevo.
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const estado = params.get("google_sheets");
    if (!estado) return;
    params.delete("google_sheets");
    const nuevaUrl = window.location.pathname + (params.toString() ? `?${params.toString()}` : "");
    window.history.replaceState({}, "", nuevaUrl);

    if (estado !== "conectado") {
      sessionStorage.removeItem(CLAVE_CARPETA_PENDIENTE);
      if (estado === "error") setError("No se pudo completar la conexión con Google.");
      return;
    }
    const carpetaId = sessionStorage.getItem(CLAVE_CARPETA_PENDIENTE) || undefined;
    sessionStorage.removeItem(CLAVE_CARPETA_PENDIENTE);
    ejecutar(carpetaId);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function handleExportar() {
    // Elegir carpeta ANTES de exportar (14/Sep/2026) - mismo criterio que
    // un "Guardar como" de escritorio: cancelar el selector cancela todo
    // el export, no se crea nada en la raiz por default.
    let carpeta;
    try {
      carpeta = await elegirCarpetaDrive();
    } catch (err) {
      setError(err instanceof Error ? err.message : "No se pudo abrir el selector de carpetas de Drive.");
      return;
    }
    if (!carpeta) return; // el usuario cancelo el selector
    await ejecutar(carpeta.id);
  }

  return { exportando, error, exportar: handleExportar };
}
