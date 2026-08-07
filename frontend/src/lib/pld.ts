// Cliente de pld-service - solo lo minimo que necesita el selector de
// "recurso" en Magic Links (frontend/src/app/admin/magic-links/page.tsx).
// Contrato: services/pld-service/pld/views.py (GET /api/kyc/).
import { apiFetch, friendlyApiError } from "./apiError";

export interface PldContraparteKyc {
  id_kyc: string;
  id_contraparte: string;
  curp: string | null;
  estado_llenado: "PENDIENTE" | "INCOMPLETO" | "ENTREGADO";
}

const PLD_API_BASE_URL = process.env.NEXT_PUBLIC_PLD_API_BASE_URL ?? "http://localhost:8002";

export async function listKyc(): Promise<PldContraparteKyc[]> {
  const response = await apiFetch("PLD", `${PLD_API_BASE_URL}/api/kyc/`);
  if (!response.ok) {
    throw await friendlyApiError("PLD", response);
  }
  return response.json();
}
