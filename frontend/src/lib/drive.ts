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

export interface DriveItem extends DriveArchivo {
  es_carpeta: boolean;
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

// Explorador real de la Unidad compartida (a diferencia de listDriveFiles,
// que resuelve una ruta fija) - carpetaId undefined/"" = raiz. Regresa
// archivos Y subcarpetas (es_carpeta) para armar navegacion tipo
// "entrar"/"regresar" (decision de Mariana, 13/Ago/2026).
export async function browseDrive(carpetaId: string | undefined, permKey: string): Promise<DriveItem[]> {
  const params = new URLSearchParams({ perm: permKey });
  if (carpetaId) params.set("carpeta_id", carpetaId);
  const response = await apiFetch("DRIVE", `${DRIVE_API_BASE_URL}/api/browse/?${params.toString()}`);
  if (!response.ok) {
    throw await friendlyApiError("DRIVE", response);
  }
  const data = await response.json();
  return data.items;
}
