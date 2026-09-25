// Google Picker para elegir CARPETA (14/Sep/2026, "dejar que ellos puedan
// escoger donde guardar" el Sheet exportado) - adaptado de
// frontend/src/lib/googlePicker.ts en feature/pld-drive-explorador (ese
// elige ARCHIVOS para el Motor Documental; este solo deja elegir una
// carpeta y regresa su id, nunca descarga nada). El token que pide aqui
// (drive.readonly, efimero, via Google Identity Services) es DISTINTO del
// access_token de larga duracion que exportarFlujosSheets ya trae del
// backend (ese vive en iam-service, scope spreadsheets+drive.file) - el
// Picker solo necesita poder LISTAR carpetas para que el usuario navegue,
// nunca se guarda ni se manda al backend.
//
// Requiere NEXT_PUBLIC_GOOGLE_CLIENT_ID (Client ID de "CumbresBI - Sheets
// personal", con drive.readonly agregado en su pantalla de consentimiento)
// y NEXT_PUBLIC_GOOGLE_PICKER_API_KEY (API Key restringida a "Google
// Picker API") - ver .env.

const GOOGLE_CLIENT_ID = process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID ?? "";
const GOOGLE_PICKER_API_KEY = process.env.NEXT_PUBLIC_GOOGLE_PICKER_API_KEY ?? "";

// Mismo z-index fix que googlePicker.ts (13/Ago/2026) - el Picker inserta
// su propio dialogo directo en <body> con z-index bajo (~1000), detras de
// cualquier Dialog de MUI (1300).
function asegurarZIndexPicker() {
  if (document.getElementById("google-picker-zindex-fix")) return;
  const style = document.createElement("style");
  style.id = "google-picker-zindex-fix";
  style.textContent = `
    .picker-dialog-bg { z-index: 1400 !important; }
    /* 25/Sep/2026, "se va muy arriba, debe estar centrada" - ver el mismo
       comentario en googleDriveFilePicker.ts::asegurarZIndexPicker. */
    .picker-dialog {
      z-index: 1401 !important;
      position: fixed !important;
      top: 50% !important;
      left: 50% !important;
      transform: translate(-50%, -50%) !important;
      margin: 0 !important;
    }
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

export interface CarpetaElegida {
  id: string;
  nombre: string;
}

// Abre el Picker en modo "elegir carpeta" (una sola vista, Mi unidad +
// Unidades compartidas navegables) - regresa null si el usuario cancela.
export async function elegirCarpetaDrive(): Promise<CarpetaElegida | null> {
  if (!GOOGLE_CLIENT_ID || !GOOGLE_PICKER_API_KEY) {
    throw new Error(
      "El selector de carpetas de Drive todavía no está configurado (falta la API Key/Client ID en Google Cloud Console)."
    );
  }

  await cargarScripts();
  asegurarZIndexPicker();
  const accessToken = await pedirAccessToken();

  return new Promise((resolve) => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const google = (window as any).google;
    // setSelectFolderEnabled(true) (14/Sep/2026) - a diferencia de
    // googlePicker.ts (ese deja esto en false, solo navega carpetas para
    // llegar a un archivo), aqui la carpeta misma ES la seleccion.
    const vistaMiUnidad = new google.picker.DocsView(google.picker.ViewId.FOLDERS)
      .setIncludeFolders(true)
      .setSelectFolderEnabled(true)
      .setOwnedByMe(true);
    const vistaUnidadesCompartidas = new google.picker.DocsView(google.picker.ViewId.FOLDERS)
      .setIncludeFolders(true)
      .setSelectFolderEnabled(true)
      .setEnableDrives(true);

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const picker = new google.picker.PickerBuilder()
      .addView(vistaMiUnidad)
      .addView(vistaUnidadesCompartidas)
      .setOAuthToken(accessToken)
      .setDeveloperKey(GOOGLE_PICKER_API_KEY)
      .setTitle("Elige la carpeta donde guardar")
      .enableFeature(google.picker.Feature.SUPPORT_DRIVES)
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      .setCallback((data: any) => {
        if (data.action === google.picker.Action.PICKED) {
          const doc = data.docs[0];
          resolve({ id: doc.id, nombre: doc.name });
        } else if (data.action === google.picker.Action.CANCEL) {
          resolve(null);
        }
      })
      .build();
    picker.setVisible(true);
  });
}
