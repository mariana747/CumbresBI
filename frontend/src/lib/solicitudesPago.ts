// Cliente de Solicitud de Pago (tesoreria-service, 04/Sep/2026 - pago de
// servicios/licencias/renovaciones, dividido por proyecto). Distinto de
// Reembolso (lib/miCumbres.ts): aqui `crear` exige el permiso real
// `solicitud-pago.crear` - no todos los colaboradores pueden solicitar
// pago (a diferencia de Reembolso, abierto a cualquier empleado).
// Contrato: services/tesoreria-service/tesoreria/views.py::TesoreriaSolicitudPagoViewSet.
import { apiFetch, friendlyApiError } from "./apiError";
import { GATEWAY_URL } from "./gatewayUrl";

const TESORERIA_API_BASE_URL = process.env.NEXT_PUBLIC_TESORERIA_API_BASE_URL ?? `${GATEWAY_URL}/tesoreria`;

export type SolicitudPagoEstado = "PENDIENTE" | "APROBADO" | "RECHAZADO" | "PAGADO";
export type SolicitudPagoTipo = "SERVICIO" | "LICENCIA" | "RENOVACION" | "OTRO";

export const TIPO_SOLICITUD_PAGO_LABELS: Record<SolicitudPagoTipo, string> = {
  SERVICIO: "Servicio",
  LICENCIA: "Licencia",
  RENOVACION: "Renovación",
  OTRO: "Otro",
};

export const ESTADO_SOLICITUD_PAGO_LABELS: Record<SolicitudPagoEstado, string> = {
  PENDIENTE: "Pendiente",
  APROBADO: "Aprobado — pendiente de pago",
  RECHAZADO: "Rechazado",
  PAGADO: "Pagado",
};

export interface TesoreriaSolicitudPago {
  id_solicitud: string;
  proyecto: string;
  sociedad: string | null;
  tipo: SolicitudPagoTipo;
  tipo_label: string;
  descripcion: string;
  monto: string;
  moneda: string;
  estado: SolicitudPagoEstado;
  solicitado_por: string;
  autorizado_por: string | null;
  fecha_autorizacion: string | null;
  link_comprobante: string | null;
  drive_file_id_comprobante: string | null;
  factura: string | null;
  factura_folio: string | null;
  flujo: string | null;
  flujo_id: string | null;
  comentarios: string | null;
  created_at: string;
  created_by: string | null;
  updated_at: string;
  updated_by: string | null;
}

export async function listSolicitudesPago(params?: {
  proyecto?: string;
  sociedad?: string;
  search?: string;
}): Promise<TesoreriaSolicitudPago[]> {
  const qs = new URLSearchParams();
  if (params?.proyecto) qs.set("proyecto", params.proyecto);
  if (params?.sociedad) qs.set("sociedad", params.sociedad);
  if (params?.search) qs.set("search", params.search);
  const response = await apiFetch("TESORERIA", `${TESORERIA_API_BASE_URL}/api/solicitudes-pago/?${qs.toString()}`);
  if (!response.ok) throw await friendlyApiError("TESORERIA", response);
  return response.json();
}

export async function crearSolicitudPago(params: {
  proyecto: string;
  sociedad?: string;
  tipo: SolicitudPagoTipo;
  descripcion: string;
  monto: string;
  moneda?: string;
  comentarios?: string;
}): Promise<TesoreriaSolicitudPago> {
  const response = await apiFetch("TESORERIA", `${TESORERIA_API_BASE_URL}/api/solicitudes-pago/`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      proyecto: params.proyecto,
      sociedad: params.sociedad || null,
      tipo: params.tipo,
      descripcion: params.descripcion,
      monto: params.monto,
      moneda: params.moneda || "MXP",
      comentarios: params.comentarios || null,
    }),
  });
  if (!response.ok) throw await friendlyApiError("TESORERIA", response);
  return response.json();
}

// Comprobante OPCIONAL (recibo oficial, linea de captura pagada, o CFDI si
// la dependencia lo emite) - subirlo nunca es requisito para llegar a
// PAGADO, ver docstring del modelo en el backend.
export async function subirComprobanteSolicitudPago(
  idSolicitud: string,
  archivo: File
): Promise<TesoreriaSolicitudPago> {
  const formData = new FormData();
  formData.append("file", archivo);
  const response = await apiFetch(
    "TESORERIA",
    `${TESORERIA_API_BASE_URL}/api/solicitudes-pago/${idSolicitud}/subir_comprobante/`,
    { method: "POST", body: formData }
  );
  if (!response.ok) throw await friendlyApiError("TESORERIA", response);
  return response.json();
}

export async function aprobarSolicitudPago(idSolicitud: string, comentarios?: string): Promise<TesoreriaSolicitudPago> {
  const response = await apiFetch(
    "TESORERIA",
    `${TESORERIA_API_BASE_URL}/api/solicitudes-pago/${idSolicitud}/aprobar/`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ comentarios }),
    }
  );
  if (!response.ok) throw await friendlyApiError("TESORERIA", response);
  return response.json();
}

export async function rechazarSolicitudPago(idSolicitud: string, comentarios?: string): Promise<TesoreriaSolicitudPago> {
  const response = await apiFetch(
    "TESORERIA",
    `${TESORERIA_API_BASE_URL}/api/solicitudes-pago/${idSolicitud}/rechazar/`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ comentarios }),
    }
  );
  if (!response.ok) throw await friendlyApiError("TESORERIA", response);
  return response.json();
}

export async function vincularFacturaSolicitudPago(
  idSolicitud: string,
  timbreUuid: string
): Promise<TesoreriaSolicitudPago> {
  const response = await apiFetch(
    "TESORERIA",
    `${TESORERIA_API_BASE_URL}/api/solicitudes-pago/${idSolicitud}/vincular_factura/`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ factura: timbreUuid }),
    }
  );
  if (!response.ok) throw await friendlyApiError("TESORERIA", response);
  return response.json();
}

export async function vincularFlujoSolicitudPago(idSolicitud: string, idFlujo: string): Promise<TesoreriaSolicitudPago> {
  const response = await apiFetch(
    "TESORERIA",
    `${TESORERIA_API_BASE_URL}/api/solicitudes-pago/${idSolicitud}/vincular_flujo/`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ flujo: idFlujo }),
    }
  );
  if (!response.ok) throw await friendlyApiError("TESORERIA", response);
  return response.json();
}
