// Cliente de vivienda-service (arranque de exposicion CRUD de Fase 3,
// 19/Ago/2026). Contrato: services/vivienda-service/vivienda/views.py.
//
// Los 6 modelos ya existian completos desde antes (heredados via
// inspectdb, sin capa de negocio) - este cliente cubre los 4 recursos
// principales (Proyectos/Viviendas/Asesores/Expedientes). Clientes/Items
// de expediente quedan pendientes de exponer en el frontend (primer corte,
// mismo criterio que Contratos/Flujos/Facturas en tesoreria.ts).
//
// Ninguno de estos modelos tiene ScopedManager todavia (sin columna de
// proyecto/sociedad declarada como scope, ver serializers.py) - el filtro
// real es por permiso (ventas-vivienda.crear/.editar), no por alcance de
// fila.
import { apiFetch, friendlyApiError } from "./apiError";
import { GATEWAY_URL } from "./gatewayUrl";

const VIVIENDA_API_BASE_URL = process.env.NEXT_PUBLIC_VIVIENDA_API_BASE_URL ?? `${GATEWAY_URL}/vivienda`;

export interface ViviendaProyecto {
  id_proyecto: string;
  alias_proyecto: string | null;
  denominacion: string | null;
  propietario: string | null;
  dom_calle: string;
  dom_numero_ext: string;
  dom_numero_int: string;
  dom_colonia: string;
  dom_municipio_alcaldia: string;
  dom_estado: string;
  dom_cp: string;
  dom_pais: string;
  link_carpeta: string | null;
  comentarios: string | null;
  created_at: string;
  created_by: string | null;
  updated_at: string;
  updated_by: string | null;
}

export async function listProyectos(search?: string): Promise<ViviendaProyecto[]> {
  const params = new URLSearchParams();
  if (search) params.set("search", search);
  const response = await apiFetch("VIVIENDA", `${VIVIENDA_API_BASE_URL}/api/proyectos/?${params.toString()}`);
  if (!response.ok) {
    throw await friendlyApiError("VIVIENDA", response);
  }
  return response.json();
}

export async function createProyecto(params: {
  denominacion: string;
  aliasProyecto?: string | null;
  propietario?: string | null;
  domCalle: string;
  domNumeroExt: string;
  domNumeroInt: string;
  domColonia: string;
  domMunicipioAlcaldia: string;
  domEstado: string;
  domCp: string;
  domPais: string;
  comentarios?: string | null;
  // created_by/updated_by son obligatorios en el ERD real (sin
  // blank=True, ver models.py) - los llena la pantalla con el user_id de
  // la sesion, nunca a mano por el usuario.
  actorId: string;
}): Promise<ViviendaProyecto> {
  const response = await apiFetch("VIVIENDA", `${VIVIENDA_API_BASE_URL}/api/proyectos/`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      denominacion: params.denominacion,
      alias_proyecto: params.aliasProyecto || null,
      propietario: params.propietario || null,
      dom_calle: params.domCalle,
      dom_numero_ext: params.domNumeroExt,
      dom_numero_int: params.domNumeroInt,
      dom_colonia: params.domColonia,
      dom_municipio_alcaldia: params.domMunicipioAlcaldia,
      dom_estado: params.domEstado,
      dom_cp: params.domCp,
      dom_pais: params.domPais,
      comentarios: params.comentarios || null,
      created_by: params.actorId,
      updated_by: params.actorId,
    }),
  });
  if (!response.ok) {
    throw await friendlyApiError("VIVIENDA", response);
  }
  return response.json();
}

export async function updateProyecto(
  idProyecto: string,
  params: Partial<{
    denominacion: string;
    aliasProyecto: string | null;
    propietario: string | null;
    domCalle: string;
    domNumeroExt: string;
    domNumeroInt: string;
    domColonia: string;
    domMunicipioAlcaldia: string;
    domEstado: string;
    domCp: string;
    domPais: string;
    comentarios: string | null;
  }>,
  actorId: string
): Promise<ViviendaProyecto> {
  const response = await apiFetch("VIVIENDA", `${VIVIENDA_API_BASE_URL}/api/proyectos/${idProyecto}/`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      denominacion: params.denominacion,
      alias_proyecto: params.aliasProyecto,
      propietario: params.propietario,
      dom_calle: params.domCalle,
      dom_numero_ext: params.domNumeroExt,
      dom_numero_int: params.domNumeroInt,
      dom_colonia: params.domColonia,
      dom_municipio_alcaldia: params.domMunicipioAlcaldia,
      dom_estado: params.domEstado,
      dom_cp: params.domCp,
      dom_pais: params.domPais,
      comentarios: params.comentarios,
      updated_by: actorId,
    }),
  });
  if (!response.ok) {
    throw await friendlyApiError("VIVIENDA", response);
  }
  return response.json();
}

export async function deleteProyecto(idProyecto: string): Promise<void> {
  const response = await apiFetch("VIVIENDA", `${VIVIENDA_API_BASE_URL}/api/proyectos/${idProyecto}/`, {
    method: "DELETE",
  });
  if (!response.ok) {
    throw await friendlyApiError("VIVIENDA", response);
  }
}

export interface ViviendaUnidad {
  id_vivienda: string;
  proyecto: string;
  proyecto_denominacion: string | null;
  num_oficial: string | null;
  etapa: string | null;
  tipo: string | null;
  modelo: string | null;
  torre: string | null;
  mz: string | null;
  lote: string | null;
  piso: string | null;
  habitaciones: number | null;
  sup_terreno_m2: string | null;
  sup_const_m2: string | null;
  precio_lista: string | null;
  disponible: boolean | null;
  muestra: boolean | null;
  denominacion: string | null;
  comentarios: string | null;
  created_at: string;
  created_by: string | null;
  updated_at: string;
  updated_by: string | null;
}

export async function listViviendas(params?: { proyecto?: string; search?: string }): Promise<ViviendaUnidad[]> {
  const query = new URLSearchParams();
  if (params?.proyecto) query.set("proyecto", params.proyecto);
  if (params?.search) query.set("search", params.search);
  const response = await apiFetch("VIVIENDA", `${VIVIENDA_API_BASE_URL}/api/viviendas/?${query.toString()}`);
  if (!response.ok) {
    throw await friendlyApiError("VIVIENDA", response);
  }
  return response.json();
}

export async function createVivienda(params: {
  proyecto: string;
  denominacion?: string | null;
  numOficial?: string | null;
  etapa?: string | null;
  tipo?: string | null;
  modelo?: string | null;
  habitaciones?: number | null;
  supTerrenoM2?: string | null;
  supConstM2?: string | null;
  precioLista?: string | null;
  disponible?: boolean;
  comentarios?: string | null;
  actorId: string;
}): Promise<ViviendaUnidad> {
  const response = await apiFetch("VIVIENDA", `${VIVIENDA_API_BASE_URL}/api/viviendas/`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      proyecto: params.proyecto,
      denominacion: params.denominacion || null,
      num_oficial: params.numOficial || null,
      etapa: params.etapa || null,
      tipo: params.tipo || null,
      modelo: params.modelo || null,
      habitaciones: params.habitaciones ?? null,
      sup_terreno_m2: params.supTerrenoM2 || null,
      sup_const_m2: params.supConstM2 || null,
      precio_lista: params.precioLista || null,
      disponible: params.disponible ?? true,
      comentarios: params.comentarios || null,
      created_by: params.actorId,
      updated_by: params.actorId,
    }),
  });
  if (!response.ok) {
    throw await friendlyApiError("VIVIENDA", response);
  }
  return response.json();
}

export async function updateVivienda(
  idVivienda: string,
  params: Partial<{
    denominacion: string | null;
    numOficial: string | null;
    etapa: string | null;
    tipo: string | null;
    modelo: string | null;
    habitaciones: number | null;
    supTerrenoM2: string | null;
    supConstM2: string | null;
    precioLista: string | null;
    disponible: boolean;
    comentarios: string | null;
  }>,
  actorId: string
): Promise<ViviendaUnidad> {
  const response = await apiFetch("VIVIENDA", `${VIVIENDA_API_BASE_URL}/api/viviendas/${idVivienda}/`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      denominacion: params.denominacion,
      num_oficial: params.numOficial,
      etapa: params.etapa,
      tipo: params.tipo,
      modelo: params.modelo,
      habitaciones: params.habitaciones,
      sup_terreno_m2: params.supTerrenoM2,
      sup_const_m2: params.supConstM2,
      precio_lista: params.precioLista,
      disponible: params.disponible,
      comentarios: params.comentarios,
      updated_by: actorId,
    }),
  });
  if (!response.ok) {
    throw await friendlyApiError("VIVIENDA", response);
  }
  return response.json();
}

export async function deleteVivienda(idVivienda: string): Promise<void> {
  const response = await apiFetch("VIVIENDA", `${VIVIENDA_API_BASE_URL}/api/viviendas/${idVivienda}/`, {
    method: "DELETE",
  });
  if (!response.ok) {
    throw await friendlyApiError("VIVIENDA", response);
  }
}

export interface ViviendaAsesor {
  id_asesor: string;
  nombre: string;
  telefono_sms: string | null;
  email: string;
  contacto: string | null;
  persona_moral: boolean;
  razon_social: string | null;
  porc_comision: string;
  rfc_afiliacion: string | null;
  comentarios: string | null;
  created_at: string;
  created_by: string | null;
  updated_at: string;
  updated_by: string | null;
}

export async function listAsesores(search?: string): Promise<ViviendaAsesor[]> {
  const params = new URLSearchParams();
  if (search) params.set("search", search);
  const response = await apiFetch("VIVIENDA", `${VIVIENDA_API_BASE_URL}/api/asesores/?${params.toString()}`);
  if (!response.ok) {
    throw await friendlyApiError("VIVIENDA", response);
  }
  return response.json();
}

export async function createAsesor(params: {
  nombre: string;
  email: string;
  telefonoSms?: string | null;
  contacto?: string | null;
  personaMoral: boolean;
  razonSocial?: string | null;
  // Ojo: max_digits=2/decimal_places=2 en el ERD real -> rango 0.00-0.99
  // (fraccion, no porcentaje entero) - ver models.py::ViviendaVentasAsesor.
  porcComision: string;
  rfcAfiliacion?: string | null;
  comentarios?: string | null;
  actorId: string;
}): Promise<ViviendaAsesor> {
  const response = await apiFetch("VIVIENDA", `${VIVIENDA_API_BASE_URL}/api/asesores/`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      nombre: params.nombre,
      email: params.email,
      telefono_sms: params.telefonoSms || null,
      contacto: params.contacto || null,
      persona_moral: params.personaMoral,
      razon_social: params.razonSocial || null,
      porc_comision: params.porcComision,
      rfc_afiliacion: params.rfcAfiliacion || null,
      comentarios: params.comentarios || null,
      created_by: params.actorId,
      updated_by: params.actorId,
    }),
  });
  if (!response.ok) {
    throw await friendlyApiError("VIVIENDA", response);
  }
  return response.json();
}

export async function updateAsesor(
  idAsesor: string,
  params: Partial<{
    nombre: string;
    email: string;
    telefonoSms: string | null;
    contacto: string | null;
    porcComision: string;
    comentarios: string | null;
  }>,
  actorId: string
): Promise<ViviendaAsesor> {
  const response = await apiFetch("VIVIENDA", `${VIVIENDA_API_BASE_URL}/api/asesores/${idAsesor}/`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      nombre: params.nombre,
      email: params.email,
      telefono_sms: params.telefonoSms,
      contacto: params.contacto,
      porc_comision: params.porcComision,
      comentarios: params.comentarios,
      updated_by: actorId,
    }),
  });
  if (!response.ok) {
    throw await friendlyApiError("VIVIENDA", response);
  }
  return response.json();
}

export async function deleteAsesor(idAsesor: string): Promise<void> {
  const response = await apiFetch("VIVIENDA", `${VIVIENDA_API_BASE_URL}/api/asesores/${idAsesor}/`, {
    method: "DELETE",
  });
  if (!response.ok) {
    throw await friendlyApiError("VIVIENDA", response);
  }
}

export type ViviendaExpedienteEstado = "PENDIENTE" | "EN PROCESO" | "CONCLUIDO" | "CANCELADO";

export interface ViviendaExpediente {
  id_expediente: string;
  vivienda: string;
  vivienda_denominacion: string | null;
  asesor: string;
  asesor_nombre: string;
  id_contrato: string;
  estado: ViviendaExpedienteEstado;
  fecha_cierre: string | null;
  link_expediente: string | null;
  comentarios: string | null;
  created_at: string;
  created_by: string | null;
  updated_at: string;
  updated_by: string | null;
}

export async function listExpedientes(params?: { vivienda?: string; asesor?: string; search?: string }): Promise<
  ViviendaExpediente[]
> {
  const query = new URLSearchParams();
  if (params?.vivienda) query.set("vivienda", params.vivienda);
  if (params?.asesor) query.set("asesor", params.asesor);
  if (params?.search) query.set("search", params.search);
  const response = await apiFetch("VIVIENDA", `${VIVIENDA_API_BASE_URL}/api/expedientes/?${query.toString()}`);
  if (!response.ok) {
    throw await friendlyApiError("VIVIENDA", response);
  }
  return response.json();
}

export async function createExpediente(params: {
  vivienda: string;
  asesor: string;
  idContrato: string;
  estado?: ViviendaExpedienteEstado;
  comentarios?: string | null;
  actorId: string;
}): Promise<ViviendaExpediente> {
  const response = await apiFetch("VIVIENDA", `${VIVIENDA_API_BASE_URL}/api/expedientes/`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      vivienda: params.vivienda,
      asesor: params.asesor,
      id_contrato: params.idContrato,
      estado: params.estado || "PENDIENTE",
      comentarios: params.comentarios || null,
      created_by: params.actorId,
      updated_by: params.actorId,
    }),
  });
  if (!response.ok) {
    throw await friendlyApiError("VIVIENDA", response);
  }
  return response.json();
}

export async function updateExpediente(
  idExpediente: string,
  params: Partial<{ estado: ViviendaExpedienteEstado; fechaCierre: string | null; comentarios: string | null }>,
  actorId: string
): Promise<ViviendaExpediente> {
  const response = await apiFetch("VIVIENDA", `${VIVIENDA_API_BASE_URL}/api/expedientes/${idExpediente}/`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      estado: params.estado,
      fecha_cierre: params.fechaCierre,
      comentarios: params.comentarios,
      updated_by: actorId,
    }),
  });
  if (!response.ok) {
    throw await friendlyApiError("VIVIENDA", response);
  }
  return response.json();
}

export async function deleteExpediente(idExpediente: string): Promise<void> {
  const response = await apiFetch("VIVIENDA", `${VIVIENDA_API_BASE_URL}/api/expedientes/${idExpediente}/`, {
    method: "DELETE",
  });
  if (!response.ok) {
    throw await friendlyApiError("VIVIENDA", response);
  }
}
