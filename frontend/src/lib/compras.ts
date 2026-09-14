// Cliente de compras-tesoreria-service (Fase 4B, 02/Sep/2026 - antes solo
// tenia el esqueleto de Fase 0, sin CRUD real. Ver services/
// compras-tesoreria-service/compras_tesoreria/views.py). No hay catalogo de
// proveedores propio - se resuelve con el ContraparteSelector compartido
// (tesoreria_contrapartes.proveedor=True), mismo criterio que
// MaterialCatalogo.proveedor en materiales-service.
import { apiFetch, friendlyApiError } from "./apiError";
import { GATEWAY_URL } from "./gatewayUrl";

const COMPRAS_API_BASE_URL = process.env.NEXT_PUBLIC_COMPRAS_API_BASE_URL ?? `${GATEWAY_URL}/compras-tesoreria`;

export interface CotizacionLinea {
  id_linea: string;
  descripcion: string;
  cantidad: string;
  precio_unitario: string;
  importe: string;
}

export interface Cotizacion {
  id_cotizacion: string;
  solicitud: string;
  proveedor: string | null;
  proveedor_nombre: string | null;
  proveedor_rfc: string | null;
  fecha_cotizacion: string | null;
  vigencia_dias: number | null;
  moneda: string | null;
  subtotal: string | null;
  iva: string | null;
  total: string | null;
  link_drive: string | null;
  estado: "PENDIENTE_REVISION" | "CONFIRMADA" | "GANADORA" | "DESCARTADA";
  estado_label: string;
  comentarios: string | null;
  lineas: CotizacionLinea[];
  created_at: string;
  updated_at: string;
}

export interface SolicitudCompra {
  id_solicitud: string;
  proyecto: string;
  requisicion: string | null;
  descripcion: string;
  estado: "PENDIENTE" | "EN_COTIZACION" | "ORDEN_GENERADA" | "CERRADA" | "CANCELADA";
  estado_label: string;
  solicitado_por: string | null;
  comentarios: string | null;
  cotizaciones: Cotizacion[];
  created_at: string;
  updated_at: string;
}

export interface OrdenCompraLinea {
  id_linea: string;
  descripcion: string;
  cantidad: string;
  cantidad_recibida: string;
  precio_unitario: string;
  importe: string;
}

export interface OrdenCompra {
  id_orden: string;
  folio: string;
  proyecto: string;
  solicitud: string;
  cotizacion: string;
  proveedor: string | null;
  proveedor_nombre: string | null;
  fecha_orden: string;
  monto_total: string;
  estado: "BORRADOR" | "ENVIADA" | "RECIBIDA_PARCIAL" | "RECIBIDA_TOTAL" | "CANCELADA";
  estado_label: string;
  autorizado_por: string | null;
  comentarios: string | null;
  lineas: OrdenCompraLinea[];
  created_at: string;
  updated_at: string;
}

export interface RecepcionLinea {
  id_linea: string;
  orden_linea: string;
  cantidad_recibida: string;
}

export interface Recepcion {
  id_recepcion: string;
  orden: string;
  fecha: string;
  hora: string;
  recibido_por: string | null;
  link_drive: string | null;
  comentarios: string | null;
  lineas: RecepcionLinea[];
  created_at: string;
}

// --- Solicitudes de compra ---

export async function listSolicitudesCompra(params?: { proyecto?: string; search?: string }): Promise<SolicitudCompra[]> {
  const qs = new URLSearchParams();
  if (params?.proyecto) qs.set("proyecto", params.proyecto);
  if (params?.search) qs.set("search", params.search);
  const response = await apiFetch("COMPRAS", `${COMPRAS_API_BASE_URL}/api/solicitudes/?${qs.toString()}`);
  if (!response.ok) throw await friendlyApiError("COMPRAS", response);
  return response.json();
}

export async function createSolicitudCompra(params: {
  proyecto: string;
  requisicion?: string | null;
  descripcion: string;
  comentarios?: string | null;
}): Promise<SolicitudCompra> {
  const response = await apiFetch("COMPRAS", `${COMPRAS_API_BASE_URL}/api/solicitudes/`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(params),
  });
  if (!response.ok) throw await friendlyApiError("COMPRAS", response);
  return response.json();
}

// --- Cotizaciones ---

export async function listCotizaciones(solicitud?: string): Promise<Cotizacion[]> {
  const qs = new URLSearchParams();
  if (solicitud) qs.set("solicitud", solicitud);
  const response = await apiFetch("COMPRAS", `${COMPRAS_API_BASE_URL}/api/cotizaciones/?${qs.toString()}`);
  if (!response.ok) throw await friendlyApiError("COMPRAS", response);
  return response.json();
}

export async function createCotizacion(params: {
  solicitud: string;
  proveedor?: string | null;
  proveedorNombre?: string | null;
}): Promise<Cotizacion> {
  const response = await apiFetch("COMPRAS", `${COMPRAS_API_BASE_URL}/api/cotizaciones/`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      solicitud: params.solicitud,
      proveedor: params.proveedor || null,
      proveedor_nombre: params.proveedorNombre || null,
    }),
  });
  if (!response.ok) throw await friendlyApiError("COMPRAS", response);
  return response.json();
}

/** Guarda lo que el analista revisó/corrigió del resultado del Motor
 * Documental (prompt "compras.cotizacion") - mismo patrón que
 * confirmarConciliacionFlujo en lib/tesoreria.ts: el frontend ya llamó a
 * docint por su cuenta, esto solo confirma. */
export async function confirmarExtraccionCotizacion(
  idCotizacion: string,
  params: {
    campos?: Record<string, unknown>;
    lineas?: Array<{ descripcion: string; cantidad: string | number; precio_unitario: string | number; importe: string | number }>;
  },
): Promise<Cotizacion> {
  const response = await apiFetch(
    "COMPRAS",
    `${COMPRAS_API_BASE_URL}/api/cotizaciones/${idCotizacion}/confirmar_extraccion/`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(params),
    },
  );
  if (!response.ok) throw await friendlyApiError("COMPRAS", response);
  return response.json();
}

// --- Órdenes de compra ---

export async function listOrdenesCompra(proyecto?: string): Promise<OrdenCompra[]> {
  const qs = new URLSearchParams();
  if (proyecto) qs.set("proyecto", proyecto);
  const response = await apiFetch("COMPRAS", `${COMPRAS_API_BASE_URL}/api/ordenes/?${qs.toString()}`);
  if (!response.ok) throw await friendlyApiError("COMPRAS", response);
  return response.json();
}

export async function generarOrdenDesdeCotizacion(idCotizacion: string): Promise<OrdenCompra> {
  const response = await apiFetch("COMPRAS", `${COMPRAS_API_BASE_URL}/api/ordenes/generar_desde_cotizacion/`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ cotizacion: idCotizacion }),
  });
  if (!response.ok) throw await friendlyApiError("COMPRAS", response);
  return response.json();
}

// --- Recepciones ---

export async function listRecepciones(orden?: string): Promise<Recepcion[]> {
  const qs = new URLSearchParams();
  if (orden) qs.set("orden", orden);
  const response = await apiFetch("COMPRAS", `${COMPRAS_API_BASE_URL}/api/recepciones/?${qs.toString()}`);
  if (!response.ok) throw await friendlyApiError("COMPRAS", response);
  return response.json();
}

export async function createRecepcion(params: {
  orden: string;
  fecha: string;
  hora: string;
  linkDrive?: string | null;
  comentarios?: string | null;
  lineas: Array<{ orden_linea: string; cantidad_recibida: string | number }>;
}): Promise<Recepcion> {
  const response = await apiFetch("COMPRAS", `${COMPRAS_API_BASE_URL}/api/recepciones/`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      orden: params.orden,
      fecha: params.fecha,
      hora: params.hora,
      link_drive: params.linkDrive || null,
      comentarios: params.comentarios || null,
      lineas: params.lineas,
    }),
  });
  if (!response.ok) throw await friendlyApiError("COMPRAS", response);
  return response.json();
}
