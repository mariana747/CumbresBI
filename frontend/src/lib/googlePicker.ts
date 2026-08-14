// Google Picker real (el widget oficial de Google) - UN SOLO boton
// "Agregar desde Drive" que abre el selector nativo completo de Google
// (mismas pestañas Recientes/Mi unidad/Compartidos que cualquier otra app
// de Google, ej. Classroom - decision de Mariana, 13/Ago/2026: nada de
// dividir en "Drive personal" vs "Unidad compartida" como dos flujos
// separados construidos por nosotros). El navegador pide un token OAuth
// con scope drive.readonly directo al usuario que tiene la sesion
// abierta, y usa ESE token para traer los bytes del archivo - la cuenta de
// servicio (domain-wide delegation) ya no participa en esta ruta.
//
// Requiere 2 valores de Google Cloud Console que hoy pueden estar vacios
// (ver conversacion 13/Ago/2026 - pendiente que Mariana los cree):
// NEXT_PUBLIC_GOOGLE_CLIENT_ID (el mismo Client ID de OAuth que ya usa el
// login, con el scope drive.readonly agregado) y
// NEXT_PUBLIC_GOOGLE_PICKER_API_KEY (API Key restringida a "Google Picker
// API"). Mientras esten vacios, openGooglePicker() rechaza con un mensaje
// claro en vez de fallar a medias cargando scripts de Google sin llave.

const GOOGLE_CLIENT_ID = process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID ?? "";
const GOOGLE_PICKER_API_KEY = process.env.NEXT_PUBLIC_GOOGLE_PICKER_API_KEY ?? "";

// Mismo criterio que MotorDocumentalDialog.tsx (EXTENSIONES_PERMITIDAS) -
// el motor solo sabe procesar imagenes/PDF (docint/providers/gemini_provider.py).
const MIME_TYPES_PERMITIDOS = "application/pdf,image/png,image/jpeg";

// El Picker de Google inserta su propio dialogo/fondo directo en <body>
// con un z-index bajo (~1000) por default - se queda DETRAS del Dialog de
// MUI del Motor Documental (z-index 1300, ver theme de MUI). Se fuerza
// aqui a que quede siempre encima (13/Ago/2026, reporte de Mariana: "la
// pantalla de Drive debe estar arriba del Motor").
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

export interface ArchivoElegido {
  file: File;
  nombre: string;
}

// Abre el Picker (un solo boton, una sola ventana con todas las pestañas
// nativas de Google), deja al usuario elegir uno o mas archivos de
// cualquier parte de su Drive, y regresa los bytes YA DESCARGADOS (fetch
// directo a la API de Drive con el access_token del usuario) listos para
// mandar a /analyze como multipart (ver docint/views.py::AnalyzeView, modo 2).
export async function openGooglePicker(): Promise<ArchivoElegido[]> {
  if (!GOOGLE_CLIENT_ID || !GOOGLE_PICKER_API_KEY) {
    throw new Error(
      "El selector de Drive todavía no está configurado (falta la API Key/Client ID en Google Cloud Console)."
    );
  }

  await cargarScripts();
  asegurarZIndexPicker();
  const accessToken = await pedirAccessToken();

  const seleccionados = await new Promise<{ id: string; name: string; mimeType: string }[]>((resolve) => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const google = (window as any).google;
    // Varias vistas (cada .addView() agrega su propia pestaña) para
    // replicar las pestañas nativas que trae cualquier selector de Drive
    // de Google (ej. Classroom: Recientes/Mi unidad/Compartidos) - una
    // sola vista con setEnableDrives(true) termina mostrando SOLO
    // Unidades compartidas (lo que se vio en la primera prueba), hay que
    // agregar "Mi unidad" y "Compartido conmigo" por separado.
    const construirVista = () => new google.picker.DocsView(google.picker.ViewId.DOCS).setMimeTypes(MIME_TYPES_PERMITIDOS).setIncludeFolders(false);

    // setParent("root") se quito - "root" es un alias que usa la API REST
    // de Drive, pero el Picker espera un ID de carpeta real; con ese alias
    // la vista de "Mi unidad" se quedaba vacia (reporte de Mariana,
    // 13/Ago/2026). Sin setParent, DocsView ya muestra todo lo que el
    // usuario posee (buscable), sin restringir a la raiz.
    const vistaRecientes = new google.picker.DocsView(google.picker.ViewId.RECENTLY_PICKED).setMimeTypes(MIME_TYPES_PERMITIDOS);
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
      .enableFeature(google.picker.Feature.MULTISELECT_ENABLED)
      .enableFeature(google.picker.Feature.SUPPORT_DRIVES)
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      .setCallback((data: any) => {
        if (data.action === google.picker.Action.PICKED) {
          resolve(data.docs.map((d: { id: string; name: string; mimeType: string }) => d));
        } else if (data.action === google.picker.Action.CANCEL) {
          resolve([]);
        }
      })
      .build();
    picker.setVisible(true);
  });

  const archivos = await Promise.all(
    seleccionados.map(async (doc) => {
      const response = await fetch(`https://www.googleapis.com/drive/v3/files/${doc.id}?alt=media`, {
        headers: { Authorization: `Bearer ${accessToken}` },
      });
      if (!response.ok) {
        throw new Error(`No se pudo descargar '${doc.name}' de Drive.`);
      }
      const blob = await response.blob();
      return { file: new File([blob], doc.name, { type: doc.mimeType }), nombre: doc.name };
    })
  );

  return archivos;
}
