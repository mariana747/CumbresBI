// Cliente de drive-service - solo lo necesario para que el frontend LISTE
// archivos ya existentes en una carpeta de Drive. El Motor Documental ya
// no sube archivos locales: el analista sube el archivo el mismo en
// drive.google.com, esta app solo lo selecciona.
// Contrato: services/drive-service/drive/views.py (GET /api/list/).
import { apiFetch, friendlyApiError } from "./apiError";
import { GATEWAY_URL } from "./gatewayUrl";

export interface DriveArchivo {
  file_id: string;
  nombre: string;
  mime_type?: string | null;
  web_view_link?: string | null;
}

const DRIVE_API_BASE_URL = `${GATEWAY_URL}/drive`;

export function driveFileIdFromUrl(url: string): string | null {
  const m = url.match(/\/d\/([a-zA-Z0-9_-]+)/) || url.match(/id=([a-zA-Z0-9_-]+)/);
  return m ? m[1] : null;
}

export async function downloadDriveFile(fileId: string, permKey: string): Promise<string> {
  const params = new URLSearchParams({ perm: permKey });
  const response = await apiFetch("DRIVE", `${DRIVE_API_BASE_URL}/api/download/${fileId}/?${params.toString()}`);
  if (!response.ok) throw await friendlyApiError("DRIVE", response);
  const blob = await response.blob();
  return URL.createObjectURL(blob);
}

export async function listDriveFiles(carpeta: string, permKey: string): Promise<DriveArchivo[]> {
  const params = new URLSearchParams({ carpeta, perm: permKey });
  const response = await apiFetch("DRIVE", `${DRIVE_API_BASE_URL}/api/list/?${params.toString()}`);
  if (!response.ok) {
    throw await friendlyApiError("DRIVE", response);
  }
  const data = await response.json();
  return data.archivos;
}
