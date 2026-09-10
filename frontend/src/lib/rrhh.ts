// Cliente de rrhh-service (10/Sep/2026, Fase 2 del modulo de Nominas - ver
// memoria de sesion "tesoreria-nominas-diseno-09sep"). Primer cliente real
// de este servicio - antes solo tenia modelos, sin API (ver
// services/rrhh-service/rrhh/views.py). Cubre Empleados y Puestos; el
// historial de sueldo se logra dando de baja el Puesto vigente (dar_de_baja)
// y creando uno nuevo con el sueldo actualizado, nunca editando
// salario_diario de un Puesto ya usado.
import { apiFetch, friendlyApiError } from "./apiError";
import { GATEWAY_URL } from "./gatewayUrl";

const RRHH_API_BASE_URL = process.env.NEXT_PUBLIC_RRHH_API_BASE_URL ?? `${GATEWAY_URL}/rrhh`;

export type RrhhEstadoCivil = "SOLTERO" | "CASADO";
export type RrhhGenero = "MUJER" | "HOMBRE";

export interface RrhhEmpleado {
  id_empleado: string;
  nombre_completo: string;
  apellido_paterno: string | null;
  apellido_materno: string | null;
  nombres: string | null;
  curp: string | null;
  rfc: string | null;
  nss: string | null;
  cta_afore: string | null;
  dom_calle: string | null;
  dom_numero_ext: string | null;
  dom_numero_int: string | null;
  dom_colonia: string | null;
  dom_cp: string | null;
  dom_municipio_alcaldia: string | null;
  dom_estado: string | null;
  estado_civil: RrhhEstadoCivil | null;
  fecha_nacimiento: string | null;
  nacimiento_mexico: boolean | null;
  municipio_nacimiento: string | null;
  estado_nacimiento: string | null;
  lugar_nacimiento_extran: string | null;
  nacionalidad: string | null;
  nombre_padre: string | null;
  nombre_madre: string | null;
  genero: RrhhGenero | null;
  telefono: string | null;
  email: string | null;
  banco: string | null;
  cuenta_banco: string | null;
  tipo_cuenta: string | null;
  link_expediente: string | null;
  estado: string | null;
  created_at: string;
  created_by: string | null;
  updated_at: string;
  updated_by: string | null;
}

export async function listEmpleados(search?: string): Promise<RrhhEmpleado[]> {
  const params = new URLSearchParams();
  if (search) params.set("search", search);
  const response = await apiFetch("RRHH", `${RRHH_API_BASE_URL}/api/empleados/?${params.toString()}`);
  if (!response.ok) {
    throw await friendlyApiError("RRHH", response);
  }
  return response.json();
}

export async function createEmpleado(params: {
  nombres?: string;
  apellidoPaterno?: string;
  apellidoMaterno?: string;
  curp?: string;
  rfc?: string;
  nss?: string;
  telefono?: string;
  email?: string;
  banco?: string;
  cuentaBanco?: string;
  tipoCuenta?: string;
  linkExpediente?: string;
  estado?: string;
}): Promise<RrhhEmpleado> {
  const response = await apiFetch("RRHH", `${RRHH_API_BASE_URL}/api/empleados/`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      nombres: params.nombres || null,
      apellido_paterno: params.apellidoPaterno || null,
      apellido_materno: params.apellidoMaterno || null,
      curp: params.curp || null,
      rfc: params.rfc || null,
      nss: params.nss || null,
      telefono: params.telefono || null,
      email: params.email || null,
      banco: params.banco || null,
      cuenta_banco: params.cuentaBanco || null,
      tipo_cuenta: params.tipoCuenta || null,
      link_expediente: params.linkExpediente || null,
      estado: params.estado || null,
    }),
  });
  if (!response.ok) {
    throw await friendlyApiError("RRHH", response);
  }
  return response.json();
}

export async function updateEmpleado(
  idEmpleado: string,
  params: Partial<{
    nombres: string;
    apellidoPaterno: string;
    apellidoMaterno: string;
    curp: string;
    rfc: string;
    nss: string;
    telefono: string;
    email: string;
    banco: string;
    cuentaBanco: string;
    tipoCuenta: string;
    linkExpediente: string;
    estado: string;
  }>
): Promise<RrhhEmpleado> {
  const response = await apiFetch("RRHH", `${RRHH_API_BASE_URL}/api/empleados/${encodeURIComponent(idEmpleado)}/`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      nombres: params.nombres,
      apellido_paterno: params.apellidoPaterno,
      apellido_materno: params.apellidoMaterno,
      curp: params.curp,
      rfc: params.rfc,
      nss: params.nss,
      telefono: params.telefono,
      email: params.email,
      banco: params.banco,
      cuenta_banco: params.cuentaBanco,
      tipo_cuenta: params.tipoCuenta,
      link_expediente: params.linkExpediente,
      estado: params.estado,
    }),
  });
  if (!response.ok) {
    throw await friendlyApiError("RRHH", response);
  }
  return response.json();
}

// Puestos - historial de sueldo (09/Sep/2026, notas de Jenny). Un Puesto
// vigente tiene fecha_baja=null; dar_de_baja() lo cierra, y crear uno
// nuevo con el sueldo actualizado es el "cambio de sueldo" (nunca se
// edita salario_diario de un Puesto ya usado).
export interface RrhhPuesto {
  id_puesto: string;
  empleado: string | null;
  empleado_nombre: string | null;
  sociedad: string | null;
  supervisor: string | null;
  proyecto: string | null;
  departamento: string | null;
  puesto: string | null;
  factor_integracion: string | null;
  salario_diario: string | null;
  descuentos_isr: string | null;
  descuentos_imss: string | null;
  tipo_salario: string | null;
  turno: string | null;
  umf: string | null;
  fecha_alta: string | null;
  fecha_baja: string | null;
  motivo_fin: string | null;
  tipo_pago: string | null;
  link_alta_imss: string | null;
  link_baja_imss: string | null;
  created_at: string;
  created_by: string | null;
  updated_at: string;
  updated_by: string | null;
}

export async function listPuestos(filtros?: {
  empleado?: string;
  sociedad?: string;
  proyecto?: string;
  vigente?: boolean;
}): Promise<RrhhPuesto[]> {
  const params = new URLSearchParams();
  if (filtros?.empleado) params.set("empleado", filtros.empleado);
  if (filtros?.sociedad) params.set("sociedad", filtros.sociedad);
  if (filtros?.proyecto) params.set("proyecto", filtros.proyecto);
  if (filtros?.vigente) params.set("vigente", "true");
  const response = await apiFetch("RRHH", `${RRHH_API_BASE_URL}/api/puestos/?${params.toString()}`);
  if (!response.ok) {
    throw await friendlyApiError("RRHH", response);
  }
  return response.json();
}

export async function createPuesto(params: {
  empleado: string;
  sociedad?: string;
  supervisor?: string;
  proyecto?: string;
  departamento?: string;
  puesto?: string;
  factorIntegracion?: string;
  salarioDiario?: string;
  descuentosIsr?: string;
  descuentosImss?: string;
  tipoSalario?: string;
  turno?: string;
  umf?: string;
  fechaAlta?: string;
  tipoPago?: string;
}): Promise<RrhhPuesto> {
  const response = await apiFetch("RRHH", `${RRHH_API_BASE_URL}/api/puestos/`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      empleado: params.empleado,
      sociedad: params.sociedad || null,
      supervisor: params.supervisor || null,
      proyecto: params.proyecto || null,
      departamento: params.departamento || null,
      puesto: params.puesto || null,
      factor_integracion: params.factorIntegracion || null,
      salario_diario: params.salarioDiario || null,
      descuentos_isr: params.descuentosIsr || null,
      descuentos_imss: params.descuentosImss || null,
      tipo_salario: params.tipoSalario || null,
      turno: params.turno || null,
      umf: params.umf || null,
      fecha_alta: params.fechaAlta || new Date().toISOString().slice(0, 10),
      tipo_pago: params.tipoPago || null,
    }),
  });
  if (!response.ok) {
    throw await friendlyApiError("RRHH", response);
  }
  return response.json();
}

export async function darDeBajaPuesto(idPuesto: string, params?: { fechaBaja?: string; motivoFin?: string }): Promise<RrhhPuesto> {
  const response = await apiFetch("RRHH", `${RRHH_API_BASE_URL}/api/puestos/${encodeURIComponent(idPuesto)}/dar_de_baja/`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      fecha_baja: params?.fechaBaja || undefined,
      motivo_fin: params?.motivoFin || undefined,
    }),
  });
  if (!response.ok) {
    throw await friendlyApiError("RRHH", response);
  }
  return response.json();
}
