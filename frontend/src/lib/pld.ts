// Cliente de pld-service. Contrato: services/pld-service/pld/views.py
// (GET/POST /api/kyc/, /api/kyc/{id}/aprobar/, /api/kyc-docs/).
import { apiFetch, friendlyApiError } from "./apiError";

export type PldEstadoLlenado = "PENDIENTE" | "INCOMPLETO" | "ENTREGADO";
export type PldDocStatus = "PENDIENTE" | "INCOMPLETO" | "ENTREGADO" | "APROBADO";

export interface PldContraparteDoc {
  id_kyc_doc: string;
  kyc: string;
  denominacion: string | null;
  detalles_adicionales: string | null;
  status: PldDocStatus | null;
  link_documento: string | null;
  fecha_solicitud: string | null;
  fecha_limite: string | null;
  fecha_entrega: string | null;
  fecha_cierre: string | null;
  comentarios: string | null;
  created_at: string;
  updated_at: string;
}

// Superset del tipo minimo usado en admin/magic-links/page.tsx - mismo
// contrato de API, aqui se listan todos los campos que la tabla de
// expedientes necesita mostrar.
export interface PldContraparteKyc {
  id_kyc: string;
  id_contraparte: string;
  curp: string | null;
  nacionalidad: string | null;
  estado_llenado: PldEstadoLlenado;
  aprobado_por: string | null;
  aprobado_en: string | null;
  comentarios: string | null;
  documentos: PldContraparteDoc[];
  created_at: string;
  updated_at: string;
  fecha_vencimiento: string | null;
}

const PLD_API_BASE_URL = process.env.NEXT_PUBLIC_PLD_API_BASE_URL ?? "http://localhost:8002";

export async function listKyc(params?: {
  estadoLlenado?: string;
  search?: string;
}): Promise<PldContraparteKyc[]> {
  const query = new URLSearchParams();
  if (params?.estadoLlenado) query.set("estado_llenado", params.estadoLlenado);
  if (params?.search) query.set("search", params.search);
  const qs = query.toString();

  const response = await apiFetch("PLD", `${PLD_API_BASE_URL}/api/kyc/${qs ? `?${qs}` : ""}`);
  if (!response.ok) {
    throw await friendlyApiError("PLD", response);
  }
  return response.json();
}

export async function aprobarKyc(idKyc: string, aprobadoPor: string): Promise<PldContraparteKyc> {
  const response = await apiFetch("PLD", `${PLD_API_BASE_URL}/api/kyc/${idKyc}/aprobar/`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ aprobado_por: aprobadoPor }),
  });
  if (!response.ok) {
    throw await friendlyApiError("PLD", response);
  }
  return response.json();
}
