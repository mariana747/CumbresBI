// Cliente de tesoreria-service (arranque formal de Fase 4, 18/Ago/2026).
// Contrato: services/tesoreria-service/tesoreria/views.py.
//
// Contrapartes/Bancos/Cuentas son catalogos compartidos entre sociedades
// (sin columna de sociedad en el ERD real, ver serializers.py) - mismo
// criterio que GeneralSociedad en iam-service: CRUD real gateado por
// permiso (tesoreria.crear/.editar), no por ScopedManager.
import { apiFetch, friendlyApiError } from "./apiError";
import { GATEWAY_URL } from "./gatewayUrl";

const TESORERIA_API_BASE_URL = process.env.NEXT_PUBLIC_TESORERIA_API_BASE_URL ?? `${GATEWAY_URL}/tesoreria`;

export type TesoreriaTipoPersona = "fisica" | "moral" | "fisica_act_emp" | "fideicomiso";

export interface TesoreriaContraparte {
  id_contraparte: string;
  rfc: string | null;
  razon_social: string;
  apellido_paterno: string | null;
  apellido_materno: string | null;
  tipo_persona: TesoreriaTipoPersona;
  genero: "MUJER" | "HOMBRE" | null;
  contacto: string | null;
  telefono_sms: string | null;
  email: string;
  cliente: boolean;
  proveedor: boolean;
  comentarios: string | null;
  permiso: string | null;
  autorizado_por: string | null;
  created_at: string;
  created_by: string | null;
  updated_at: string;
  updated_by: string | null;
}

export async function listContrapartes(search?: string): Promise<TesoreriaContraparte[]> {
  const params = new URLSearchParams();
  if (search) params.set("search", search);
  const response = await apiFetch("TESORERIA", `${TESORERIA_API_BASE_URL}/api/contrapartes/?${params.toString()}`);
  if (!response.ok) {
    throw await friendlyApiError("TESORERIA", response);
  }
  return response.json();
}

export async function createContraparte(params: {
  razonSocial: string;
  rfc?: string | null;
  tipoPersona: TesoreriaTipoPersona;
  email: string;
  contacto?: string | null;
  telefonoSms?: string | null;
  cliente?: boolean;
  proveedor?: boolean;
  comentarios?: string | null;
}): Promise<TesoreriaContraparte> {
  const response = await apiFetch("TESORERIA", `${TESORERIA_API_BASE_URL}/api/contrapartes/`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      razon_social: params.razonSocial,
      rfc: params.rfc || null,
      tipo_persona: params.tipoPersona,
      email: params.email,
      contacto: params.contacto || null,
      telefono_sms: params.telefonoSms || null,
      cliente: params.cliente ?? false,
      proveedor: params.proveedor ?? false,
      comentarios: params.comentarios || null,
    }),
  });
  if (!response.ok) {
    throw await friendlyApiError("TESORERIA", response);
  }
  return response.json();
}

export async function updateContraparte(
  idContraparte: string,
  params: Partial<{
    razonSocial: string;
    rfc: string | null;
    tipoPersona: TesoreriaTipoPersona;
    email: string;
    contacto: string | null;
    telefonoSms: string | null;
    cliente: boolean;
    proveedor: boolean;
    comentarios: string | null;
  }>
): Promise<TesoreriaContraparte> {
  const response = await apiFetch("TESORERIA", `${TESORERIA_API_BASE_URL}/api/contrapartes/${idContraparte}/`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      razon_social: params.razonSocial,
      rfc: params.rfc,
      tipo_persona: params.tipoPersona,
      email: params.email,
      contacto: params.contacto,
      telefono_sms: params.telefonoSms,
      cliente: params.cliente,
      proveedor: params.proveedor,
      comentarios: params.comentarios,
    }),
  });
  if (!response.ok) {
    throw await friendlyApiError("TESORERIA", response);
  }
  return response.json();
}

export async function deleteContraparte(idContraparte: string): Promise<void> {
  const response = await apiFetch("TESORERIA", `${TESORERIA_API_BASE_URL}/api/contrapartes/${idContraparte}/`, {
    method: "DELETE",
  });
  if (!response.ok) {
    throw await friendlyApiError("TESORERIA", response);
  }
}

export interface TesoreriaBanco {
  id_banxico: string;
  banco: string | null;
  alias: string | null;
  created_at: string;
  created_by: string | null;
  updated_at: string;
  updated_by: string | null;
}

export async function listBancos(search?: string): Promise<TesoreriaBanco[]> {
  const params = new URLSearchParams();
  if (search) params.set("search", search);
  const response = await apiFetch("TESORERIA", `${TESORERIA_API_BASE_URL}/api/bancos/?${params.toString()}`);
  if (!response.ok) {
    throw await friendlyApiError("TESORERIA", response);
  }
  return response.json();
}

export async function createBanco(params: { idBanxico: string; banco?: string; alias?: string }): Promise<TesoreriaBanco> {
  const response = await apiFetch("TESORERIA", `${TESORERIA_API_BASE_URL}/api/bancos/`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ id_banxico: params.idBanxico, banco: params.banco || null, alias: params.alias || null }),
  });
  if (!response.ok) {
    throw await friendlyApiError("TESORERIA", response);
  }
  return response.json();
}

export async function deleteBanco(idBanxico: string): Promise<void> {
  const response = await apiFetch("TESORERIA", `${TESORERIA_API_BASE_URL}/api/bancos/${idBanxico}/`, { method: "DELETE" });
  if (!response.ok) {
    throw await friendlyApiError("TESORERIA", response);
  }
}

export interface TesoreriaCuenta {
  id_cuenta_bancaria: string;
  rfc_razon_social: string | null;
  banco: string | null;
  banco_nombre: string | null;
  cuenta: string | null;
  clabe: string | null;
  alias: string | null;
  label: string | null;
  activa: boolean | null;
  apertura: string;
  cierre: string | null;
  created_at: string;
  created_by: string | null;
  updated_at: string;
  updated_by: string | null;
}

export async function listCuentas(search?: string): Promise<TesoreriaCuenta[]> {
  const params = new URLSearchParams();
  if (search) params.set("search", search);
  const response = await apiFetch("TESORERIA", `${TESORERIA_API_BASE_URL}/api/cuentas/?${params.toString()}`);
  if (!response.ok) {
    throw await friendlyApiError("TESORERIA", response);
  }
  return response.json();
}

export async function createCuenta(params: {
  rfcRazonSocial?: string;
  banco: string;
  cuenta?: string;
  clabe?: string;
  alias?: string;
  label?: string;
  activa?: boolean;
  apertura: string;
}): Promise<TesoreriaCuenta> {
  const response = await apiFetch("TESORERIA", `${TESORERIA_API_BASE_URL}/api/cuentas/`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      rfc_razon_social: params.rfcRazonSocial || null,
      banco: params.banco,
      cuenta: params.cuenta || null,
      clabe: params.clabe || null,
      alias: params.alias || null,
      label: params.label || null,
      activa: params.activa ?? true,
      apertura: params.apertura,
    }),
  });
  if (!response.ok) {
    throw await friendlyApiError("TESORERIA", response);
  }
  return response.json();
}

export async function updateCuenta(
  idCuentaBancaria: string,
  params: Partial<{ alias: string; label: string; activa: boolean; cierre: string | null }>
): Promise<TesoreriaCuenta> {
  const response = await apiFetch("TESORERIA", `${TESORERIA_API_BASE_URL}/api/cuentas/${idCuentaBancaria}/`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(params),
  });
  if (!response.ok) {
    throw await friendlyApiError("TESORERIA", response);
  }
  return response.json();
}

export async function deleteCuenta(idCuentaBancaria: string): Promise<void> {
  const response = await apiFetch("TESORERIA", `${TESORERIA_API_BASE_URL}/api/cuentas/${idCuentaBancaria}/`, {
    method: "DELETE",
  });
  if (!response.ok) {
    throw await friendlyApiError("TESORERIA", response);
  }
}

export type TesoreriaContratoTipo = "INTERNO" | "EXTERNO";
export type TesoreriaTipoPago = "REGULAR" | "IRREGULAR" | "UNICO";
export type TesoreriaFrecuencia = "MENSUAL" | "BIMESTRAL" | "TRIMESTRAL" | "SEMESTRAL" | "ANUAL" | "OTRA" | "SEMANAL";
export type TesoreriaMoneda = "MXP" | "USD" | "EUR";
export type TesoreriaContratoStatus = "ACTIVO" | "INACTIVO";

// Primer recurso con alcance real por sociedad (ver
// tesoreria/models.py::TesoreriaContrato.SCOPE_FIELD_SOCIEDAD) - el
// backend ya filtra por sociedad_rfcs del EffectiveScope, este cliente no
// necesita mandar ningun filtro de sociedad aparte.
export interface TesoreriaContrato {
  id_contrato: string;
  sociedad: string;
  contraparte: string;
  contraparte_nombre: string;
  tipo: TesoreriaContratoTipo | null;
  fecha_generacion: string | null;
  fecha_vencimiento: string | null;
  tipo_pago: TesoreriaTipoPago | null;
  frecuencia: TesoreriaFrecuencia | null;
  moneda: TesoreriaMoneda | null;
  monto_periodo_iva_mxp: string | null;
  monto_total_iva_mxp: string | null;
  requiere_factura: boolean | null;
  status: TesoreriaContratoStatus | null;
  comentarios: string | null;
  link_contrato: string | null;
  created_at: string;
  created_by: string | null;
  updated_at: string;
  updated_by: string | null;
}

export async function listContratos(search?: string): Promise<TesoreriaContrato[]> {
  const params = new URLSearchParams();
  if (search) params.set("search", search);
  const response = await apiFetch("TESORERIA", `${TESORERIA_API_BASE_URL}/api/contratos/?${params.toString()}`);
  if (!response.ok) {
    throw await friendlyApiError("TESORERIA", response);
  }
  return response.json();
}

export async function createContrato(params: {
  sociedad: string;
  contraparte: string;
  tipo?: TesoreriaContratoTipo;
  fechaGeneracion?: string;
  fechaVencimiento?: string;
  tipoPago?: TesoreriaTipoPago;
  frecuencia?: TesoreriaFrecuencia;
  moneda?: TesoreriaMoneda;
  montoTotalIvaMxp?: string;
  requiereFactura?: boolean;
  status?: TesoreriaContratoStatus;
  comentarios?: string;
}): Promise<TesoreriaContrato> {
  const response = await apiFetch("TESORERIA", `${TESORERIA_API_BASE_URL}/api/contratos/`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      sociedad: params.sociedad,
      contraparte: params.contraparte,
      tipo: params.tipo || null,
      fecha_generacion: params.fechaGeneracion || null,
      fecha_vencimiento: params.fechaVencimiento || null,
      tipo_pago: params.tipoPago || null,
      frecuencia: params.frecuencia || null,
      moneda: params.moneda || null,
      monto_total_iva_mxp: params.montoTotalIvaMxp || null,
      requiere_factura: params.requiereFactura ?? false,
      status: params.status || "ACTIVO",
      comentarios: params.comentarios || null,
    }),
  });
  if (!response.ok) {
    throw await friendlyApiError("TESORERIA", response);
  }
  return response.json();
}

export async function updateContrato(
  idContrato: string,
  params: Partial<{
    tipo: TesoreriaContratoTipo;
    fechaGeneracion: string;
    fechaVencimiento: string;
    tipoPago: TesoreriaTipoPago;
    frecuencia: TesoreriaFrecuencia;
    moneda: TesoreriaMoneda;
    montoTotalIvaMxp: string;
    requiereFactura: boolean;
    status: TesoreriaContratoStatus;
    comentarios: string;
  }>
): Promise<TesoreriaContrato> {
  const response = await apiFetch("TESORERIA", `${TESORERIA_API_BASE_URL}/api/contratos/${idContrato}/`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      tipo: params.tipo,
      fecha_generacion: params.fechaGeneracion,
      fecha_vencimiento: params.fechaVencimiento,
      tipo_pago: params.tipoPago,
      frecuencia: params.frecuencia,
      moneda: params.moneda,
      monto_total_iva_mxp: params.montoTotalIvaMxp,
      requiere_factura: params.requiereFactura,
      status: params.status,
      comentarios: params.comentarios,
    }),
  });
  if (!response.ok) {
    throw await friendlyApiError("TESORERIA", response);
  }
  return response.json();
}
