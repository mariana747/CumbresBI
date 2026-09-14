// Cliente de drive-service - solo lo necesario para que el frontend LISTE
// archivos ya existentes en una carpeta de Drive (el Motor Documental ya no
// sube archivos locales, ver memoria de sesion
// "motor-documental-seleccion-archivos-drive": el analista sube el archivo
// el mismo en drive.google.com, esta app solo lo selecciona).
// Contrato: services/drive-service/drive/views.py (GET /api/list/).
import { apiFetch, friendlyApiError } from "./apiError";
import { GATEWAY_URL } from "./gatewayUrl";

export interface DriveArchivo {
  file_id: string;
  nombre: string;
  mime_type?: string | null;
  web_view_link?: string | null;
}

const DRIVE_API_BASE_URL = process.env.NEXT_PUBLIC_DRIVE_API_BASE_URL ?? `${GATEWAY_URL}/drive`;

export async function listDriveFiles(carpeta: string, permKey: string): Promise<DriveArchivo[]> {
  const params = new URLSearchParams({ carpeta, perm: permKey });
  const response = await apiFetch("DRIVE", `${DRIVE_API_BASE_URL}/api/list/?${params.toString()}`);
  if (!response.ok) {
    throw await friendlyApiError("DRIVE", response);
  }
  const data = await response.json();
  return data.archivos;
}
