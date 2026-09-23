// Google Picker para elegir un ARCHIVO de Drive personal (14/Sep/2026,
// "en conciliación bancaria hay que dar la opción actual [subir del
// equipo] y una para drive") - adaptado de
// frontend/src/lib/googlePicker.ts en feature/pld-drive-explorador (ese
// filtra a PDF/imagenes para el Motor Documental; este filtra a CSV/Excel
// para el extracto bancario) y de googleFolderPicker.ts (mismo Client ID/
// API Key, mismo patron de carga de scripts).
//
// Mismo token efimero de drive.readonly via Google Identity Services que
// el selector de carpeta - nunca se guarda, solo sirve para que el
// navegador liste/descargue el archivo elegido.

const GOOGLE_CLIENT_ID = process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID ?? "";
const GOOGLE_PICKER_API_KEY = process.env.NEXT_PUBLIC_GOOGLE_PICKER_API_KEY ?? "";

export const MIME_TYPES_EXTRACTO =
  "text/csv,application/vnd.ms-excel,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,text/xml,application/xml";

// Comprobantes/recibos (14/Sep/2026, "igual para subir el comprobante,
// subir desde la pc o desde el drive, esto ya lo habíamos hecho antes") -
// mismo Picker que el extracto bancario, filtrado a PDF/imagen en vez de
// CSV/Excel (ver elegirArchivoDrive, parametro `mimeTypes`).
export const MIME_TYPES_COMPROBANTE = "application/pdf,image/png,image/jpeg,image/jpg";

function asegurarZIndexPicker() {
  if (document.getElementById("google-picker-zindex-fix")) return;
  const style = document.createElement("style");
  style.id = "google-picker-zindex-fix";
  style.textContent = `
    .picker-dialog-bg { z-index: 1400 !important; }
    .picker-dialog { z-index: 1401 !important; }
  `;
  document.head.appendChild(style);
}

let scriptsPromise: Promise<void> | null = null;

function cargarScripts(): Promise<void> {
  if (scriptsPromise) return scriptsPromise;
  scriptsPromise = new Promise((resolve, reject) => {
    let pendientes = 2;
    const listo = () => {
      pendientes -= 1;
      if (pendientes === 0) resolve();
    };
    const fallo = (src: string) => reject(new Error(`No se pudo cargar ${src}`));

    const gapiScript = document.createElement("script");
    gapiScript.src = "https://apis.google.com/js/api.js";
    gapiScript.onload = () => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (window as any).gapi.load("picker", listo);
    };
    gapiScript.onerror = () => fallo(gapiScript.src);
    document.body.appendChild(gapiScript);

    const gisScript = document.createElement("script");
    gisScript.src = "https://accounts.google.com/gsi/client";
    gisScript.onload = listo;
    gisScript.onerror = () => fallo(gisScript.src);
    document.body.appendChild(gisScript);
  });
  return scriptsPromise;
}

function pedirAccessToken(): Promise<string> {
  return new Promise((resolve, reject) => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const google = (window as any).google;
    const client = google.accounts.oauth2.initTokenClient({
      client_id: GOOGLE_CLIENT_ID,
      scope: "https://www.googleapis.com/auth/drive.readonly",
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      callback: (resp: any) => {
        if (resp.error) reject(new Error(`No se pudo autorizar Drive: ${resp.error}`));
        else resolve(resp.access_token);
      },
    });
    client.requestAccessToken();
  });
}

// Abre el Picker filtrado a CSV/Excel, deja elegir UN archivo de
// cualquier parte del Drive del usuario, y regresa los bytes ya
// descargados (fetch directo con el access_token efimero) listos para
// mandar tal cual a importarExtractoBancario. null si el usuario cancela.
export async function elegirArchivoDrive(
  mimeTypes: string = MIME_TYPES_EXTRACTO,
  titulo: string = "Elige el extracto bancario"
): Promise<File | null> {
  if (!GOOGLE_CLIENT_ID || !GOOGLE_PICKER_API_KEY) {
    throw new Error(
      "El selector de Drive todavía no está configurado (falta la API Key/Client ID en Google Cloud Console)."
    );
  }

  await cargarScripts();
  asegurarZIndexPicker();
  const accessToken = await pedirAccessToken();

  const elegido = await new Promise<{ id: string; name: string; mimeType: string } | null>((resolve) => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const google = (window as any).google;
    const construirVista = () =>
      new google.picker.DocsView(google.picker.ViewId.DOCS).setMimeTypes(mimeTypes).setIncludeFolders(true);

    const vistaRecientes = new google.picker.DocsView(google.picker.ViewId.RECENTLY_PICKED).setMimeTypes(
      mimeTypes
    );
    const vistaMiUnidad = construirVista().setOwnedByMe(true);
    const vistaCompartidoConmigo = construirVista().setOwnedByMe(false);
    const vistaUnidadesCompartidas = construirVista().setEnableDrives(true);

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const picker = new google.picker.PickerBuilder()
      .addView(vistaRecientes)
      .addView(vistaMiUnidad)
      .addView(vistaCompartidoConmigo)
      .addView(vistaUnidadesCompartidas)
      .setOAuthToken(accessToken)
      .setDeveloperKey(GOOGLE_PICKER_API_KEY)
      .setTitle(titulo)
      .enableFeature(google.picker.Feature.SUPPORT_DRIVES)
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      .setCallback((data: any) => {
        if (data.action === google.picker.Action.PICKED) {
          resolve(data.docs[0]);
        } else if (data.action === google.picker.Action.CANCEL) {
          resolve(null);
        }
      })
      .build();
    picker.setVisible(true);
  });

  if (!elegido) return null;

  const response = await fetch(`https://www.googleapis.com/drive/v3/files/${elegido.id}?alt=media`, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (!response.ok) {
    throw new Error(`No se pudo descargar '${elegido.name}' de Drive.`);
  }
  const blob = await response.blob();
  return new File([blob], elegido.name, { type: elegido.mimeType });
}
