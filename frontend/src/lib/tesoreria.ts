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

// Genera un ID corto (8 hex) igual al formato que hasta ahora solo
// generaba el backend (uuid.hex[:8], ver tesoreria/models.py::_short_id).
// Se usa para mostrar el ID real en pantalla ANTES de guardar (Contraparte/
// Cuenta) - mismo patron que generarIdSaldo() en saldos/page.tsx, solo que
// aqui vive en un solo lugar porque lo usan dos pantallas distintas.
export function generarIdCorto(): string {
  return crypto.randomUUID().replace(/-/g, "").slice(0, 8);
}

export type TesoreriaTipoPersona = "fisica" | "moral" | "fisica_act_emp" | "fideicomiso";

export interface TesoreriaContraparte {
  id_contraparte: string;
  rfc: string | null;
  razon_social: string;
  apellido_paterno: string | null;
  apellido_materno: string | null;
  // opcional desde 19/Ago/2026 (migracion 0002) - la contraparte maestra
  // unica se puede dar de alta con solo razon_social, el resto se llena
  // despues (mismo criterio que ya usaba PLD por su cuenta, ver
  // docs/architecture/README.md sec. 11.2 #7).
  tipo_persona: TesoreriaTipoPersona | null;
  genero: "MUJER" | "HOMBRE" | null;
  contacto: string | null;
  telefono_sms: string | null;
  email: string | null;
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

// tipoFiltro (19/Ago/2026): ?cliente=1 / ?proveedor=1 en tesoreria-service -
// deja mostrar solo uno u otro segun el contexto (ej. ContraparteSelector
// en el "Nuevo expediente" de PLD, preguntando si es cliente o proveedor).
export async function listContrapartes(
  search?: string,
  tipoFiltro?: "cliente" | "proveedor"
): Promise<TesoreriaContraparte[]> {
  const params = new URLSearchParams();
  if (search) params.set("search", search);
  if (tipoFiltro) params.set(tipoFiltro, "1");
  const response = await apiFetch("TESORERIA", `${TESORERIA_API_BASE_URL}/api/contrapartes/?${params.toString()}`);
  if (!response.ok) {
    throw await friendlyApiError("TESORERIA", response);
  }
  return response.json();
}

// Para mostrar el nombre de una contraparte ya guardada en otro modulo
// (ej. ViviendaRelExpedienteCliente.id_contraparte, un CharField plano sin
// nombre denormalizado) - no hay forma de buscar por ID via ?search=, asi
// que esto pega directo al retrieve por PK.
export async function getContraparte(idContraparte: string): Promise<TesoreriaContraparte> {
  const response = await apiFetch("TESORERIA", `${TESORERIA_API_BASE_URL}/api/contrapartes/${idContraparte}/`);
  if (!response.ok) {
    throw await friendlyApiError("TESORERIA", response);
  }
  return response.json();
}

export async function createContraparte(params: {
  // Generado en el frontend antes de abrir el dialogo (ver
  // generarIdCorto() en tesoreria.ts) - se manda explicito para poder
  // mostrar el ID real en pantalla desde antes de guardar, mismo patron
  // que TesoreriaSaldo.id. El backend lo acepta (ya no es read_only, ver
  // TesoreriaContraparteSerializer) y lo genera solo si no llega nada.
  idContraparte: string;
  razonSocial: string;
  rfc?: string | null;
  // Opcionales desde 19/Ago/2026 - ver docstring de TesoreriaContraparte
  // arriba. Alta minima real: solo razonSocial es obligatorio.
  apellidoPaterno?: string | null;
  apellidoMaterno?: string | null;
  tipoPersona?: TesoreriaTipoPersona | null;
  genero?: "MUJER" | "HOMBRE" | null;
  email?: string | null;
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
      id_contraparte: params.idContraparte,
      razon_social: params.razonSocial,
      rfc: params.rfc || null,
      apellido_paterno: params.apellidoPaterno || null,
      apellido_materno: params.apellidoMaterno || null,
      tipo_persona: params.tipoPersona || null,
      genero: params.genero || null,
      email: params.email || null,
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
    apellidoPaterno: string | null;
    apellidoMaterno: string | null;
    tipoPersona: TesoreriaTipoPersona | null;
    genero: "MUJER" | "HOMBRE" | null;
    email: string | null;
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
      apellido_paterno: params.apellidoPaterno,
      apellido_materno: params.apellidoMaterno,
      tipo_persona: params.tipoPersona,
      genero: params.genero,
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

export type TesoreriaTipoRelacion = "REP LEGAL" | "BENEF CONTROLADOR";

// Representante legal / beneficiario controlador de una contraparte - dato
// que pide PLD/AML (ver tesoreria/serializers.py::TesoreriaContraparteRelacionSerializer).
// contraparte_relacion es OTRA fila del catalogo maestro (una persona
// fisica dada de alta aparte), no texto libre.
export interface TesoreriaContraparteRelacion {
  id_relacion: string;
  contraparte: string;
  contraparte_nombre: string;
  contraparte_relacion: string;
  contraparte_relacion_nombre: string;
  tipo_relacion: TesoreriaTipoRelacion;
  created_at: string;
  created_by: string | null;
  updated_at: string;
  updated_by: string | null;
}

export async function listContraparteRelaciones(idContraparte: string): Promise<TesoreriaContraparteRelacion[]> {
  const params = new URLSearchParams({ contraparte: idContraparte });
  const response = await apiFetch(
    "TESORERIA",
    `${TESORERIA_API_BASE_URL}/api/contrapartes-relacion/?${params.toString()}`
  );
  if (!response.ok) {
    throw await friendlyApiError("TESORERIA", response);
  }
  return response.json();
}

export async function createContraparteRelacion(params: {
  // Ver comentario en createContraparte - generado en el frontend antes de
  // abrir el dialogo, mismo patron.
  idRelacion: string;
  contraparte: string;
  contraparteRelacion: string;
  tipoRelacion: TesoreriaTipoRelacion;
}): Promise<TesoreriaContraparteRelacion> {
  const response = await apiFetch("TESORERIA", `${TESORERIA_API_BASE_URL}/api/contrapartes-relacion/`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      id_relacion: params.idRelacion,
      contraparte: params.contraparte,
      contraparte_relacion: params.contraparteRelacion,
      tipo_relacion: params.tipoRelacion,
    }),
  });
  if (!response.ok) {
    throw await friendlyApiError("TESORERIA", response);
  }
  return response.json();
}

export async function deleteContraparteRelacion(idRelacion: string): Promise<void> {
  const response = await apiFetch(
    "TESORERIA",
    `${TESORERIA_API_BASE_URL}/api/contrapartes-relacion/${idRelacion}/`,
    { method: "DELETE" }
  );
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

export async function updateBanco(
  idBanxico: string,
  params: Partial<{ banco: string | null; alias: string | null }>
): Promise<TesoreriaBanco> {
  const response = await apiFetch("TESORERIA", `${TESORERIA_API_BASE_URL}/api/bancos/${idBanxico}/`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(params),
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
  // Ver comentario equivalente en createContraparte - generado en el
  // frontend antes de abrir el dialogo, mismo patron que TesoreriaSaldo.id.
  idCuentaBancaria: string;
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
      id_cuenta_bancaria: params.idCuentaBancaria,
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

export type TesoreriaCorteEdcTipo = "corte" | "estado_cuenta";
export type TesoreriaCorteEdcFormato = "pdf" | "excel" | "csv" | "otro";

// Corte / estado de cuenta bancario - el archivo subido para conciliar
// contra los flujos capturados (ver tesoreria/serializers.py::TesoreriaCorteEdcSerializer).
// `link` es una URL pegada a mano, mismo criterio que ObraEvidencia.link_drive
// mientras no exista una integracion real de subida de archivo.
export interface TesoreriaCorteEdc {
  id: string;
  cuenta: string;
  cuenta_alias: string | null;
  fecha_final: string;
  tipo: TesoreriaCorteEdcTipo;
  formato: TesoreriaCorteEdcFormato;
  link: string;
  disponible: boolean | null;
  created_at: string;
  created_by: string;
  updated_at: string;
  updated_by: string;
}

export async function listCortesEdc(idCuenta: string): Promise<TesoreriaCorteEdc[]> {
  const params = new URLSearchParams({ cuenta: idCuenta });
  const response = await apiFetch("TESORERIA", `${TESORERIA_API_BASE_URL}/api/cortes-edc/?${params.toString()}`);
  if (!response.ok) {
    throw await friendlyApiError("TESORERIA", response);
  }
  return response.json();
}

export async function createCorteEdc(params: {
  // Ver comentario en createContraparte - generado en el frontend antes de
  // abrir el dialogo, mismo patron.
  id: string;
  cuenta: string;
  fechaFinal: string;
  tipo: TesoreriaCorteEdcTipo;
  formato: TesoreriaCorteEdcFormato;
  link: string;
  disponible?: boolean;
  // created_by/updated_by (max 8) no son opcionales en el modelo (a
  // diferencia de Contrato) - se manda el user_id de la sesion actual,
  // mismo criterio que TesoreriaCuenta/TesoreriaBanco cuando capturan quien
  // hizo el alta.
  createdBy: string;
}): Promise<TesoreriaCorteEdc> {
  const response = await apiFetch("TESORERIA", `${TESORERIA_API_BASE_URL}/api/cortes-edc/`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      id: params.id,
      cuenta: params.cuenta,
      fecha_final: params.fechaFinal,
      tipo: params.tipo,
      formato: params.formato,
      link: params.link,
      disponible: params.disponible ?? true,
      created_by: params.createdBy,
      updated_by: params.createdBy,
    }),
  });
  if (!response.ok) {
    throw await friendlyApiError("TESORERIA", response);
  }
  return response.json();
}

export async function deleteCorteEdc(id: string): Promise<void> {
  const response = await apiFetch("TESORERIA", `${TESORERIA_API_BASE_URL}/api/cortes-edc/${id}/`, {
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
  proyecto: string | null;
  propiedad: string | null;
  centro: string | null;
  tipo_pago: TesoreriaTipoPago | null;
  frecuencia: TesoreriaFrecuencia | null;
  duracion: string | null;
  fecha_proyectada: string | null;
  moneda: TesoreriaMoneda | null;
  monto_periodo_iva_mxp: string | null;
  monto_total_iva_mxp: string | null;
  concepto_factura: string | null;
  link_carpeta: string | null;
  requiere_factura: boolean | null;
  status: TesoreriaContratoStatus | null;
  comentarios: string | null;
  link_contrato: string | null;
  permiso: string | null;
  autorizacion: boolean | null;
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
  proyecto?: string;
  propiedad?: string;
  centro?: string;
  tipoPago?: TesoreriaTipoPago;
  frecuencia?: TesoreriaFrecuencia;
  duracion?: string;
  fechaProyectada?: string;
  moneda?: TesoreriaMoneda;
  montoPeriodoIvaMxp?: string;
  montoTotalIvaMxp?: string;
  conceptoFactura?: string;
  linkCarpeta?: string;
  linkContrato?: string;
  requiereFactura?: boolean;
  status?: TesoreriaContratoStatus;
  comentarios?: string;
  permiso?: string;
  autorizacion?: boolean;
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
      proyecto: params.proyecto || null,
      propiedad: params.propiedad || null,
      centro: params.centro || null,
      tipo_pago: params.tipoPago || null,
      frecuencia: params.frecuencia || null,
      duracion: params.duracion || null,
      fecha_proyectada: params.fechaProyectada || null,
      moneda: params.moneda || null,
      monto_periodo_iva_mxp: params.montoPeriodoIvaMxp || null,
      monto_total_iva_mxp: params.montoTotalIvaMxp || null,
      concepto_factura: params.conceptoFactura || null,
      link_carpeta: params.linkCarpeta || null,
      link_contrato: params.linkContrato || null,
      requiere_factura: params.requiereFactura ?? false,
      status: params.status || "ACTIVO",
      comentarios: params.comentarios || null,
      permiso: params.permiso || null,
      autorizacion: params.autorizacion ?? null,
    }),
  });
  if (!response.ok) {
    throw await friendlyApiError("TESORERIA", response);
  }
  return response.json();
}

export type TesoreriaValidacionEstado = "PENDIENTE" | "APROBADA" | "RECHAZADA";

// Flujo de caja (24/Ago/2026, Sem 21 del cronograma) - segundo recurso con
// alcance real por sociedad (via contrato.sociedad, ver
// tesoreria/models.py::TesoreriaFlujo.SCOPE_FIELD_SOCIEDAD). factura/
// complemento/nomina son de solo lectura en el PATCH normal (ver
// TesoreriaFlujoSerializer.read_only_fields) - se llenan unicamente via
// vincularFactura(), que pega al endpoint vincular_factura/ (unico que
// valida que el timbre_uuid exista de verdad antes de ligarlo). `nomina`
// se expone de solo lectura nada mas: el backend todavia no tiene una
// accion equivalente para vincularla (solo factura/complemento).
//
// estado_cfdi/requiere_complemento/comprobacion_asignada_a/aprobacion_lista/
// permiso_enviar_pago/informacion_envio/ultimo_envio/permiso/
// fecha_pago_original (25/Ago/2026): columnas del ERD heredadas del
// AppSheet original sin accion propia todavia en el ViewSet - se agregan
// aqui de escritura libre, como comentarios, para la pestaña
// Referencias/CFDI/Control del formulario de creacion.
export interface TesoreriaFlujo {
  id_flujo: string;
  contrato: string | null;
  contrato_sociedad: string | null;
  id_empleado: string | null;
  id_requisicion: string | null;
  fecha_efectiva: string | null;
  concepto: string | null;
  reembolso: boolean | null;
  id_empleado_reembolso: string | null;
  cuenta: string;
  cuenta_alias: string | null;
  total_mxp: string | null;
  autorizacion: boolean | null;
  autorizado_por: string | null;
  fecha_autorizacion: string | null;
  link_referencia: string | null;
  pagado: boolean | null;
  fecha_pago: string | null;
  fecha_pago_original: string | null;
  descripcion_pago: string | null;
  link_comprobante_banco: string | null;
  factura: string | null;
  complemento: string | null;
  nomina: string | null;
  estado_cfdi: string | null;
  requiere_complemento: boolean | null;
  comprobacion_asignada_a: string | null;
  validacion_estado: TesoreriaValidacionEstado | null;
  aprobacion_lista: boolean | null;
  permiso_enviar_pago: string | null;
  informacion_envio: string | null;
  ultimo_envio: string | null;
  permiso: string | null;
  comentarios: string | null;
  created_at: string;
  created_by: string | null;
  updated_at: string;
  updated_by: string | null;
}

export async function listFlujos(params?: { search?: string; contrato?: string }): Promise<TesoreriaFlujo[]> {
  const query = new URLSearchParams();
  if (params?.search) query.set("search", params.search);
  if (params?.contrato) query.set("contrato", params.contrato);
  const response = await apiFetch("TESORERIA", `${TESORERIA_API_BASE_URL}/api/flujos/?${query.toString()}`);
  if (!response.ok) {
    throw await friendlyApiError("TESORERIA", response);
  }
  return response.json();
}

export async function createFlujo(params: {
  contrato?: string;
  cuenta: string;
  totalMxp?: string;
  fechaEfectiva?: string;
  concepto?: string;
  reembolso?: boolean;
  idEmpleado?: string;
  idEmpleadoReembolso?: string;
  idRequisicion?: string;
  linkReferencia?: string;
  comprobacionAsignadaA?: string;
  estadoCfdi?: string;
  requiereComplemento?: boolean;
  aprobacionLista?: boolean;
  permisoEnviarPago?: string;
  permiso?: string;
  informacionEnvio?: string;
  comentarios?: string;
  fechaPagoOriginal?: string;
  linkComprobanteBanco?: string;
}): Promise<TesoreriaFlujo> {
  const response = await apiFetch("TESORERIA", `${TESORERIA_API_BASE_URL}/api/flujos/`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      contrato: params.contrato || null,
      cuenta: params.cuenta,
      total_mxp: params.totalMxp || null,
      fecha_efectiva: params.fechaEfectiva || null,
      concepto: params.concepto || null,
      reembolso: params.reembolso ?? false,
      id_empleado: params.idEmpleado || null,
      id_empleado_reembolso: params.idEmpleadoReembolso || null,
      id_requisicion: params.idRequisicion || null,
      link_referencia: params.linkReferencia || null,
      comprobacion_asignada_a: params.comprobacionAsignadaA || null,
      estado_cfdi: params.estadoCfdi || null,
      requiere_complemento: params.requiereComplemento ?? null,
      aprobacion_lista: params.aprobacionLista ?? null,
      permiso_enviar_pago: params.permisoEnviarPago || null,
      permiso: params.permiso || null,
      informacion_envio: params.informacionEnvio || null,
      fecha_pago_original: params.fechaPagoOriginal || null,
      link_comprobante_banco: params.linkComprobanteBanco || null,
      comentarios: params.comentarios || null,
    }),
  });
  if (!response.ok) {
    throw await friendlyApiError("TESORERIA", response);
  }
  return response.json();
}

export async function updateFlujo(
  idFlujo: string,
  params: Partial<{
    concepto: string;
    fechaEfectiva: string;
    totalMxp: string;
    linkReferencia: string;
    comentarios: string;
    fechaPagoOriginal: string;
    linkComprobanteBanco: string;
  }>
): Promise<TesoreriaFlujo> {
  const response = await apiFetch("TESORERIA", `${TESORERIA_API_BASE_URL}/api/flujos/${idFlujo}/`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      concepto: params.concepto,
      fecha_efectiva: params.fechaEfectiva,
      total_mxp: params.totalMxp,
      link_referencia: params.linkReferencia,
      comentarios: params.comentarios,
      fecha_pago_original: params.fechaPagoOriginal,
      link_comprobante_banco: params.linkComprobanteBanco,
    }),
  });
  if (!response.ok) {
    throw await friendlyApiError("TESORERIA", response);
  }
  return response.json();
}

// Ciclo de vida propio del flujo (segregacion de funciones: aprobar/
// rechazar requieren tesoreria.aprobar, distinto de crear/editar - ver
// docstring de TesoreriaFlujoViewSet). autorizadoPor viaja en el body
// porque el backend todavia no resuelve el actor desde el JWT en este
// punto del proyecto (mismo criterio que PldContraparteKycViewSet.aprobar).
export async function aprobarFlujo(idFlujo: string, autorizadoPor: string): Promise<TesoreriaFlujo> {
  const response = await apiFetch("TESORERIA", `${TESORERIA_API_BASE_URL}/api/flujos/${idFlujo}/aprobar/`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ autorizado_por: autorizadoPor }),
  });
  if (!response.ok) {
    throw await friendlyApiError("TESORERIA", response);
  }
  return response.json();
}

export async function rechazarFlujo(idFlujo: string): Promise<TesoreriaFlujo> {
  const response = await apiFetch("TESORERIA", `${TESORERIA_API_BASE_URL}/api/flujos/${idFlujo}/rechazar/`, {
    method: "POST",
  });
  if (!response.ok) {
    throw await friendlyApiError("TESORERIA", response);
  }
  return response.json();
}

export async function registrarPagoFlujo(
  idFlujo: string,
  params?: { descripcionPago?: string; linkComprobanteBanco?: string }
): Promise<TesoreriaFlujo> {
  const response = await apiFetch("TESORERIA", `${TESORERIA_API_BASE_URL}/api/flujos/${idFlujo}/registrar_pago/`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      descripcion_pago: params?.descripcionPago || null,
      link_comprobante_banco: params?.linkComprobanteBanco || null,
    }),
  });
  if (!response.ok) {
    throw await friendlyApiError("TESORERIA", response);
  }
  return response.json();
}

// Liga un flujo ya capturado a una factura/complemento de pago reales (ver
// tesoreria/views.py::TesoreriaFlujoViewSet.vincular_factura) - manda el
// timbre_uuid de cada uno, el backend valida que exista antes de guardar el
// enlace (400 si no). Requiere tesoreria.editar, igual que registrarPago.
export async function vincularFactura(
  idFlujo: string,
  params: { factura?: string; complemento?: string }
): Promise<TesoreriaFlujo> {
  const response = await apiFetch("TESORERIA", `${TESORERIA_API_BASE_URL}/api/flujos/${idFlujo}/vincular_factura/`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      factura: params.factura || undefined,
      complemento: params.complemento || undefined,
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
    proyecto: string;
    propiedad: string;
    centro: string;
    tipoPago: TesoreriaTipoPago;
    frecuencia: TesoreriaFrecuencia;
    duracion: string;
    fechaProyectada: string;
    moneda: TesoreriaMoneda;
    montoPeriodoIvaMxp: string;
    montoTotalIvaMxp: string;
    conceptoFactura: string;
    linkCarpeta: string;
    linkContrato: string;
    requiereFactura: boolean;
    status: TesoreriaContratoStatus;
    comentarios: string;
    permiso: string;
    autorizacion: boolean;
  }>
): Promise<TesoreriaContrato> {
  const response = await apiFetch("TESORERIA", `${TESORERIA_API_BASE_URL}/api/contratos/${idContrato}/`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      tipo: params.tipo,
      fecha_generacion: params.fechaGeneracion,
      fecha_vencimiento: params.fechaVencimiento,
      proyecto: params.proyecto,
      propiedad: params.propiedad,
      centro: params.centro,
      tipo_pago: params.tipoPago,
      frecuencia: params.frecuencia,
      duracion: params.duracion,
      fecha_proyectada: params.fechaProyectada,
      moneda: params.moneda,
      monto_periodo_iva_mxp: params.montoPeriodoIvaMxp,
      monto_total_iva_mxp: params.montoTotalIvaMxp,
      concepto_factura: params.conceptoFactura,
      link_carpeta: params.linkCarpeta,
      link_contrato: params.linkContrato,
      requiere_factura: params.requiereFactura,
      status: params.status,
      comentarios: params.comentarios,
      permiso: params.permiso,
      autorizacion: params.autorizacion,
    }),
  });
  if (!response.ok) {
    throw await friendlyApiError("TESORERIA", response);
  }
  return response.json();
}

// Facturacion CFDI (Sem 20 del cronograma, CRUD real agregado 24/Ago/2026 -
// ver tesoreria/views.py::_PermisosFacturacionCfdiMixin). Permiso propio
// "facturacion-cfdi.crear/.editar", distinto de "tesoreria.*" - por eso
// estas 4 pantallas usan su propio gate en vez de puedeCrear/puedeEditar
// de Contrapartes/Cuentas/Contratos/Flujos.
export interface FacturaConcepto {
  id: number;
  uuid: string | null;
  clave_prod_serv: string | null;
  no_identificacion: string | null;
  cantidad: string | null;
  clave_unidad: string | null;
  unidad: string | null;
  descripcion: string | null;
  valor_unitario: string | null;
  importe: string | null;
  descuento: string | null;
  objeto_imp: string | null;
  rfc_propietario: string | null;
  created_at: string;
  created_by: string | null;
  updated_at: string;
  updated_by: string | null;
}

// CRUD real de las lineas de detalle (Sem 20, agregado 24/Ago/2026 - antes
// solo se veian de solo lectura dentro del dialogo de editar factura, ver
// tesoreria/views.py::FacturaConceptoViewSet). Sin FK real hacia
// TesoreriaFactura en el ERD (uuid es un CharField plano, ver docstring del
// modelo) - el enlace real es el filtro ?uuid=<timbre_uuid de la factura>.
export async function listFacturaConceptos(uuidFactura: string): Promise<FacturaConcepto[]> {
  const response = await apiFetch(
    "TESORERIA",
    `${TESORERIA_API_BASE_URL}/api/factura-conceptos/?uuid=${encodeURIComponent(uuidFactura)}`
  );
  if (!response.ok) {
    throw await friendlyApiError("TESORERIA", response);
  }
  return response.json();
}

export interface FacturaConceptoInput {
  claveProdServ?: string;
  noIdentificacion?: string;
  cantidad?: string;
  claveUnidad?: string;
  unidad?: string;
  descripcion?: string;
  valorUnitario?: string;
  importe?: string;
  descuento?: string;
  objetoImp?: string;
}

function facturaConceptoBody(params: FacturaConceptoInput) {
  return {
    clave_prod_serv: params.claveProdServ || null,
    no_identificacion: params.noIdentificacion || null,
    cantidad: normalizaDecimal(params.cantidad),
    clave_unidad: params.claveUnidad || null,
    unidad: params.unidad || null,
    descripcion: params.descripcion || null,
    valor_unitario: normalizaDecimal(params.valorUnitario),
    importe: normalizaDecimal(params.importe),
    descuento: normalizaDecimal(params.descuento),
    objeto_imp: params.objetoImp || null,
  };
}

export async function createFacturaConcepto(
  uuidFactura: string,
  params: FacturaConceptoInput
): Promise<FacturaConcepto> {
  const response = await apiFetch("TESORERIA", `${TESORERIA_API_BASE_URL}/api/factura-conceptos/`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ uuid: uuidFactura, ...facturaConceptoBody(params) }),
  });
  if (!response.ok) {
    throw await friendlyApiError("TESORERIA", response);
  }
  return response.json();
}

export async function updateFacturaConcepto(id: number, params: FacturaConceptoInput): Promise<FacturaConcepto> {
  const response = await apiFetch("TESORERIA", `${TESORERIA_API_BASE_URL}/api/factura-conceptos/${id}/`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(facturaConceptoBody(params)),
  });
  if (!response.ok) {
    throw await friendlyApiError("TESORERIA", response);
  }
  return response.json();
}

export async function deleteFacturaConcepto(id: number): Promise<void> {
  const response = await apiFetch("TESORERIA", `${TESORERIA_API_BASE_URL}/api/factura-conceptos/${id}/`, {
    method: "DELETE",
  });
  if (!response.ok) {
    throw await friendlyApiError("TESORERIA", response);
  }
}

// Linea de impuesto trasladado de una factura - mismo criterio de enlace
// logico por ?uuid= (ver FacturaTrasladoViewSet).
export interface FacturaTraslado {
  id: number;
  uuid: string | null;
  base: string | null;
  impuesto: string | null;
  tipo_factor: string | null;
  tasa_o_cuota: string | null;
  importe: string | null;
  rfc_propietario: string | null;
  created_at: string;
  created_by: string | null;
  updated_at: string;
  updated_by: string | null;
}

export async function listFacturaTraslados(uuidFactura: string): Promise<FacturaTraslado[]> {
  const response = await apiFetch(
    "TESORERIA",
    `${TESORERIA_API_BASE_URL}/api/factura-traslados/?uuid=${encodeURIComponent(uuidFactura)}`
  );
  if (!response.ok) {
    throw await friendlyApiError("TESORERIA", response);
  }
  return response.json();
}

export interface FacturaTrasladoInput {
  base?: string;
  impuesto?: string;
  tipoFactor?: string;
  tasaOCuota?: string;
  importe?: string;
}

function facturaTrasladoBody(params: FacturaTrasladoInput) {
  return {
    base: normalizaDecimal(params.base),
    impuesto: params.impuesto || null,
    tipo_factor: params.tipoFactor || null,
    tasa_o_cuota: params.tasaOCuota || null,
    importe: normalizaDecimal(params.importe),
  };
}

export async function createFacturaTraslado(
  uuidFactura: string,
  params: FacturaTrasladoInput
): Promise<FacturaTraslado> {
  const response = await apiFetch("TESORERIA", `${TESORERIA_API_BASE_URL}/api/factura-traslados/`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ uuid: uuidFactura, ...facturaTrasladoBody(params) }),
  });
  if (!response.ok) {
    throw await friendlyApiError("TESORERIA", response);
  }
  return response.json();
}

export async function deleteFacturaTraslado(id: number): Promise<void> {
  const response = await apiFetch("TESORERIA", `${TESORERIA_API_BASE_URL}/api/factura-traslados/${id}/`, {
    method: "DELETE",
  });
  if (!response.ok) {
    throw await friendlyApiError("TESORERIA", response);
  }
}

// Documento relacionado de una factura (parcialidades de pago) - enlace
// logico por ?timbre_uuid= (ver FacturaDoctoRelacionadoViewSet).
export interface FacturaDoctoRelacionado {
  id: number;
  timbre_uuid: string | null;
  id_documento: string | null;
  serie: string | null;
  folio: string | null;
  moneda_dr: string | null;
  num_parcialidad: number | null;
  imp_saldo_ant: string | null;
  imp_pagado: string | null;
  imp_saldo_insoluto: string | null;
  rfc_propietario: string | null;
  created_at: string;
  created_by: string | null;
  updated_at: string;
  updated_by: string | null;
}

export async function listFacturaDoctosRelacionados(timbreUuid: string): Promise<FacturaDoctoRelacionado[]> {
  const response = await apiFetch(
    "TESORERIA",
    `${TESORERIA_API_BASE_URL}/api/factura-doctos-relacionados/?timbre_uuid=${encodeURIComponent(timbreUuid)}`
  );
  if (!response.ok) {
    throw await friendlyApiError("TESORERIA", response);
  }
  return response.json();
}

export interface FacturaDoctoRelacionadoInput {
  idDocumento?: string;
  serie?: string;
  folio?: string;
  monedaDr?: string;
  numParcialidad?: string;
  impSaldoAnt?: string;
  impPagado?: string;
  impSaldoInsoluto?: string;
}

function facturaDoctoRelacionadoBody(params: FacturaDoctoRelacionadoInput) {
  return {
    id_documento: params.idDocumento || null,
    serie: params.serie || null,
    folio: params.folio || null,
    moneda_dr: params.monedaDr || null,
    num_parcialidad: params.numParcialidad ? Number(params.numParcialidad) : null,
    imp_saldo_ant: normalizaDecimal(params.impSaldoAnt),
    imp_pagado: normalizaDecimal(params.impPagado),
    imp_saldo_insoluto: normalizaDecimal(params.impSaldoInsoluto),
  };
}

export async function createFacturaDoctoRelacionado(
  timbreUuid: string,
  params: FacturaDoctoRelacionadoInput
): Promise<FacturaDoctoRelacionado> {
  const response = await apiFetch("TESORERIA", `${TESORERIA_API_BASE_URL}/api/factura-doctos-relacionados/`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ timbre_uuid: timbreUuid, ...facturaDoctoRelacionadoBody(params) }),
  });
  if (!response.ok) {
    throw await friendlyApiError("TESORERIA", response);
  }
  return response.json();
}

export async function deleteFacturaDoctoRelacionado(id: number): Promise<void> {
  const response = await apiFetch("TESORERIA", `${TESORERIA_API_BASE_URL}/api/factura-doctos-relacionados/${id}/`, {
    method: "DELETE",
  });
  if (!response.ok) {
    throw await friendlyApiError("TESORERIA", response);
  }
}

// Renglon de una nota de credito (distinto del encabezado TesoreriaNotaCredito)
// - enlace logico por ?uuid=<uuid propio de la nota> (ver FacturaNotaCreditoViewSet).
export interface NotaCreditoConcepto {
  id: number;
  uuid: string | null;
  uuid_relacionado: string | null;
  clave_prod_serv: string | null;
  no_identificacion: string | null;
  cantidad: string | null;
  clave_unidad: string | null;
  unidad: string | null;
  descripcion: string | null;
  valor_unitario: string | null;
  importe: string | null;
  objeto_imp: string | null;
  rfc_propietario: string | null;
  created_at: string;
  created_by: string | null;
  updated_at: string;
  updated_by: string | null;
}

export async function listNotaCreditoConceptos(uuidNota: string): Promise<NotaCreditoConcepto[]> {
  const response = await apiFetch(
    "TESORERIA",
    `${TESORERIA_API_BASE_URL}/api/nota-credito-conceptos/?uuid=${encodeURIComponent(uuidNota)}`
  );
  if (!response.ok) {
    throw await friendlyApiError("TESORERIA", response);
  }
  return response.json();
}

export interface NotaCreditoConceptoInput {
  claveProdServ?: string;
  noIdentificacion?: string;
  cantidad?: string;
  claveUnidad?: string;
  unidad?: string;
  descripcion?: string;
  valorUnitario?: string;
  importe?: string;
  objetoImp?: string;
}

function notaCreditoConceptoBody(params: NotaCreditoConceptoInput) {
  return {
    clave_prod_serv: params.claveProdServ || null,
    no_identificacion: params.noIdentificacion || null,
    cantidad: normalizaDecimal(params.cantidad),
    clave_unidad: params.claveUnidad || null,
    unidad: params.unidad || null,
    descripcion: params.descripcion || null,
    valor_unitario: normalizaDecimal(params.valorUnitario),
    importe: normalizaDecimal(params.importe),
    objeto_imp: params.objetoImp || null,
  };
}

export async function createNotaCreditoConcepto(
  uuidNota: string,
  params: NotaCreditoConceptoInput
): Promise<NotaCreditoConcepto> {
  const response = await apiFetch("TESORERIA", `${TESORERIA_API_BASE_URL}/api/nota-credito-conceptos/`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ uuid: uuidNota, ...notaCreditoConceptoBody(params) }),
  });
  if (!response.ok) {
    throw await friendlyApiError("TESORERIA", response);
  }
  return response.json();
}

export async function deleteNotaCreditoConcepto(id: number): Promise<void> {
  const response = await apiFetch("TESORERIA", `${TESORERIA_API_BASE_URL}/api/nota-credito-conceptos/${id}/`, {
    method: "DELETE",
  });
  if (!response.ok) {
    throw await friendlyApiError("TESORERIA", response);
  }
}

// Ciclo de vida propio de la factura (24/Ago/2026, pedido explicito de
// Mariana) - distinto del ciclo de un TesoreriaFlujo, no se segrega
// captura/aprobacion aqui (mismo permiso facturacion-cfdi.editar para
// cualquier transicion, ver marcarEstadoFactura). Pasar a ACEPTADA exige
// link_pdf + link_xml ya cargados (el backend lo valida, ver
// TesoreriaFacturaViewSet.marcar_estado).
export type TesoreriaFacturaEstado = "PENDIENTE" | "EN_PROCESO" | "ACEPTADA" | "RECHAZADA";

// Catalogo c_TipoDeComprobante del SAT - en esta pantalla solo se ofrece
// "I" (Ingreso): Egreso/Pago/Nomina ya tienen su propia tabla y pantalla
// (tesoreria_notas_credito, tesoreria_complementos_pago,
// tesoreria_rec_nominas), no se dan de alta desde Facturas.
export type TesoreriaFacturaMetodoPago = "PUE" | "PPD";

export interface TesoreriaFactura {
  id: number;
  // Se llena automatico por RFC (emisor_rfc) al crear/confirmar extraccion
  // - de solo lectura aqui, ver TesoreriaFacturaSerializer.read_only_fields.
  contraparte: string | null;
  contraparte_nombre: string | null;
  comprobante_version: string | null;
  comprobante_serie: string | null;
  comprobante_folio: string | null;
  comprobante_fecha: string | null;
  comprobante_forma_pago: string | null;
  comprobante_no_certificado: string | null;
  comprobante_sub_total: string | null;
  comprobante_metodo_pago: TesoreriaFacturaMetodoPago | null;
  comprobante_moneda: string | null;
  comprobante_exportacion: string | null;
  comprobante_tipo_cambio: string | null;
  comprobante_total: string | null;
  comprobante_tipo_de_comprobante: string | null;
  comprobante_lugar_expedicion: string | null;
  tipo_relacion: string | null;
  uuid_relacionado: string | null;
  emisor_rfc: string | null;
  emisor_nombre: string | null;
  emisor_regimen_fiscal: string | null;
  receptor_rfc: string | null;
  receptor_nombre: string | null;
  receptor_domicilio_fiscal_receptor: string | null;
  receptor_regimen_fiscal_receptor: string | null;
  receptor_uso_cfdi: string | null;
  timbre_version: string | null;
  timbre_uuid: string;
  timbre_fecha_timbrado: string | null;
  timbre_rfc_prov_certif: string | null;
  timbre_no_certificado_sat: string | null;
  tipo_factura: string | null;
  link_pdf: string | null;
  link_xml: string | null;
  // De solo lectura en el backend (ver TesoreriaFacturaSerializer.read_only_fields)
  // - solo cambia via marcarEstadoFactura(), no via update/createFactura.
  estado: TesoreriaFacturaEstado | null;
  conceptos: FacturaConcepto[];
  created_at: string;
  created_by: string | null;
  updated_at: string;
  updated_by: string | null;
}

export async function listFacturas(search?: string, contraparte?: string): Promise<TesoreriaFactura[]> {
  const params = new URLSearchParams();
  if (search) params.set("search", search);
  if (contraparte) params.set("contraparte", contraparte);
  const response = await apiFetch("TESORERIA", `${TESORERIA_API_BASE_URL}/api/facturas/?${params.toString()}`);
  if (!response.ok) {
    throw await friendlyApiError("TESORERIA", response);
  }
  return response.json();
}

export interface FacturaInput {
  comprobanteVersion?: string;
  comprobanteSerie?: string;
  comprobanteFolio?: string;
  comprobanteFecha?: string;
  comprobanteFormaPago?: string;
  comprobanteNoCertificado?: string;
  comprobanteSubTotal?: string;
  comprobanteMetodoPago?: TesoreriaFacturaMetodoPago | "";
  comprobanteMoneda?: string;
  comprobanteExportacion?: string;
  comprobanteTipoCambio?: string;
  comprobanteTotal?: string;
  comprobanteTipoDeComprobante?: string;
  comprobanteLugarExpedicion?: string;
  tipoRelacion?: string;
  uuidRelacionado?: string;
  emisorRfc?: string;
  emisorNombre?: string;
  emisorRegimenFiscal?: string;
  receptorRfc?: string;
  receptorNombre?: string;
  receptorDomicilioFiscalReceptor?: string;
  receptorRegimenFiscalReceptor?: string;
  receptorUsoCfdi?: string;
  timbreVersion?: string;
  timbreUuid?: string;
  timbreFechaTimbrado?: string;
  timbreRfcProvCertif?: string;
  timbreNoCertificadoSat?: string;
  tipoFactura?: string;
  linkPdf?: string;
  linkXml?: string;
  // NO incluye "estado" - es de solo lectura en el backend (ver
  // TesoreriaFacturaSerializer), se cambia unicamente via
  // marcarEstadoFactura(). Mandarlo aqui no truena, el backend lo ignora
  // en silencio, pero se omite del tipo para no sugerir que funciona.
}

// Los campos de monto de Facturacion CFDI son DecimalField en el backend
// (ver tesoreria/models.py) - si el usuario captura "84,360.00" con separador
// de miles, Django los rechaza tal cual con "Se requiere un numero valido."
// (TESORERIA-400). Se le quitan comas/espacios antes de mandarlo, igual que
// ya hace cualquier <input type="number"> nativo por su cuenta.
function normalizaDecimal(valor?: string): string | null {
  if (!valor) return null;
  const limpio = valor.replace(/[,\s]/g, "");
  return limpio || null;
}

function facturaBody(params: FacturaInput) {
  return {
    comprobante_version: params.comprobanteVersion || null,
    comprobante_serie: params.comprobanteSerie || null,
    comprobante_folio: params.comprobanteFolio || null,
    comprobante_fecha: params.comprobanteFecha || null,
    comprobante_forma_pago: params.comprobanteFormaPago || null,
    comprobante_no_certificado: params.comprobanteNoCertificado || null,
    comprobante_sub_total: normalizaDecimal(params.comprobanteSubTotal),
    comprobante_metodo_pago: params.comprobanteMetodoPago || null,
    comprobante_moneda: params.comprobanteMoneda || null,
    comprobante_exportacion: params.comprobanteExportacion || null,
    comprobante_tipo_cambio: params.comprobanteTipoCambio || null,
    comprobante_total: normalizaDecimal(params.comprobanteTotal),
    comprobante_tipo_de_comprobante: params.comprobanteTipoDeComprobante || null,
    comprobante_lugar_expedicion: params.comprobanteLugarExpedicion || null,
    tipo_relacion: params.tipoRelacion || null,
    uuid_relacionado: params.uuidRelacionado || null,
    emisor_rfc: params.emisorRfc || null,
    emisor_nombre: params.emisorNombre || null,
    emisor_regimen_fiscal: params.emisorRegimenFiscal || null,
    receptor_rfc: params.receptorRfc || null,
    receptor_nombre: params.receptorNombre || null,
    receptor_domicilio_fiscal_receptor: params.receptorDomicilioFiscalReceptor || null,
    receptor_regimen_fiscal_receptor: params.receptorRegimenFiscalReceptor || null,
    receptor_uso_cfdi: params.receptorUsoCfdi || null,
    timbre_version: params.timbreVersion || null,
    timbre_uuid: params.timbreUuid || undefined,
    timbre_fecha_timbrado: params.timbreFechaTimbrado || null,
    timbre_rfc_prov_certif: params.timbreRfcProvCertif || null,
    timbre_no_certificado_sat: params.timbreNoCertificadoSat || null,
    tipo_factura: params.tipoFactura || null,
    link_pdf: params.linkPdf || null,
    link_xml: params.linkXml || null,
  };
}

export async function createFactura(params: FacturaInput): Promise<TesoreriaFactura> {
  const response = await apiFetch("TESORERIA", `${TESORERIA_API_BASE_URL}/api/facturas/`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(facturaBody(params)),
  });
  if (!response.ok) {
    throw await friendlyApiError("TESORERIA", response);
  }
  return response.json();
}

export async function updateFactura(id: number, params: FacturaInput): Promise<TesoreriaFactura> {
  const response = await apiFetch("TESORERIA", `${TESORERIA_API_BASE_URL}/api/facturas/${id}/`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(facturaBody(params)),
  });
  if (!response.ok) {
    throw await friendlyApiError("TESORERIA", response);
  }
  return response.json();
}

export async function deleteFactura(id: number): Promise<void> {
  const response = await apiFetch("TESORERIA", `${TESORERIA_API_BASE_URL}/api/facturas/${id}/`, { method: "DELETE" });
  if (!response.ok) {
    throw await friendlyApiError("TESORERIA", response);
  }
}

// Cambia el estado del proceso de revision de la factura (PENDIENTE/
// EN_PROCESO/ACEPTADA/RECHAZADA). Ver
// services/tesoreria-service/tesoreria/views.py::TesoreriaFacturaViewSet.marcar_estado -
// el backend rechaza con 400 si se intenta ACEPTADA sin link_pdf/link_xml.
export async function marcarEstadoFactura(id: number, estado: TesoreriaFacturaEstado): Promise<TesoreriaFactura> {
  const response = await apiFetch("TESORERIA", `${TESORERIA_API_BASE_URL}/api/facturas/${id}/marcar_estado/`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ estado }),
  });
  if (!response.ok) {
    throw await friendlyApiError("TESORERIA", response);
  }
  return response.json();
}

// Motor Documental para Facturacion CFDI (24/Ago/2026) - espejo en cliente
// de TesoreriaFacturaViewSet.CAMPOS_CONFIRMABLES (views.py). Solo
// informativo aqui (MotorDocumentalDialog filtra con esto antes de mandar),
// el backend es quien realmente valida. timbre_uuid queda fuera a
// proposito - es la identidad de la factura, no se pisa desde una
// extraccion (mismo criterio documentado en el backend).
export const TESORERIA_CAMPOS_CONFIRMABLES = [
  "comprobante_version",
  "comprobante_serie",
  "comprobante_folio",
  "comprobante_fecha",
  "comprobante_no_certificado",
  "comprobante_sub_total",
  "comprobante_moneda",
  "comprobante_exportacion",
  "comprobante_tipo_cambio",
  "comprobante_forma_pago",
  "comprobante_metodo_pago",
  "comprobante_total",
  "comprobante_lugar_expedicion",
  "emisor_rfc",
  "emisor_nombre",
  "emisor_regimen_fiscal",
  "receptor_rfc",
  "receptor_nombre",
  "receptor_domicilio_fiscal_receptor",
  "receptor_regimen_fiscal_receptor",
  "receptor_uso_cfdi",
  "timbre_version",
  "timbre_fecha_timbrado",
  "timbre_rfc_prov_certif",
  "timbre_no_certificado_sat",
] as const;

// Version usada al CREAR una factura desde el Motor Documental (24/Ago/2026,
// caso de uso real: alguien sube el escaneo de la factura a Drive antes de
// que exista el registro en Tesoreria - a futuro desde MiCumbres, hoy el
// analista lo sube directo) - aqui SI incluye timbre_uuid porque todavia no
// hay ningun registro cuya identidad proteger (a diferencia de
// TESORERIA_CAMPOS_CONFIRMABLES, que es para una factura ya guardada).
export const TESORERIA_CAMPOS_CONFIRMABLES_NUEVA = [...TESORERIA_CAMPOS_CONFIRMABLES, "timbre_uuid"] as const;

// Guarda en la factura los datos ya revisados por el analista (Motor
// Documental -> docint/analyze -> correccion en pantalla -> este endpoint).
// Ver services/tesoreria-service/tesoreria/views.py::TesoreriaFacturaViewSet.confirmar_extraccion.
export async function confirmarExtraccionFactura(
  id: number,
  campos: Record<string, unknown>
): Promise<TesoreriaFactura> {
  const response = await apiFetch("TESORERIA", `${TESORERIA_API_BASE_URL}/api/facturas/${id}/confirmar_extraccion/`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ campos }),
  });
  if (!response.ok) {
    throw await friendlyApiError("TESORERIA", response);
  }
  return response.json();
}

export interface TesoreriaComplementoPago {
  id: number;
  contraparte: string | null;
  contraparte_nombre: string | null;
  version: string | null;
  timbre_uuid: string;
  serie: string | null;
  folio: string | null;
  fecha: string | null;
  no_certificado: string | null;
  lugar_expedicion: string | null;
  moneda: string | null;
  tipo_de_comprobante: string | null;
  exportacion: string | null;
  sub_total: string | null;
  total: string | null;
  emisor_rfc: string | null;
  emisor_nombre: string | null;
  emisor_regimen_fiscal: string | null;
  receptor_rfc: string | null;
  receptor_nombre: string | null;
  receptor_domicilio_fiscal_receptor: string | null;
  receptor_regimen_fiscal_receptor: string | null;
  receptor_uso_cfdi: string | null;
  timbre_version: string | null;
  timbre_fecha_timbrado: string | null;
  timbre_rfc_prov_certif: string | null;
  timbre_no_certificado_sat: string | null;
  fecha_de_pago: string | null;
  monto_pagado: string | null;
  uuid_relacion: string | null;
  tipo_factura: string | null;
  link_pdf: string | null;
  estado: string | null;
  created_at: string;
  created_by: string | null;
  updated_at: string;
  updated_by: string | null;
}

export async function listComplementosPago(
  search?: string,
  contraparte?: string
): Promise<TesoreriaComplementoPago[]> {
  const params = new URLSearchParams();
  if (search) params.set("search", search);
  if (contraparte) params.set("contraparte", contraparte);
  const response = await apiFetch("TESORERIA", `${TESORERIA_API_BASE_URL}/api/complementos-pago/?${params.toString()}`);
  if (!response.ok) {
    throw await friendlyApiError("TESORERIA", response);
  }
  return response.json();
}

export interface ComplementoPagoInput {
  version?: string;
  timbreUuid?: string;
  serie?: string;
  folio?: string;
  fecha?: string;
  noCertificado?: string;
  lugarExpedicion?: string;
  moneda?: string;
  tipoDeComprobante?: string;
  exportacion?: string;
  subTotal?: string;
  total?: string;
  emisorRfc?: string;
  emisorNombre?: string;
  emisorRegimenFiscal?: string;
  receptorRfc?: string;
  receptorNombre?: string;
  receptorDomicilioFiscalReceptor?: string;
  receptorRegimenFiscalReceptor?: string;
  receptorUsoCfdi?: string;
  timbreVersion?: string;
  timbreFechaTimbrado?: string;
  timbreRfcProvCertif?: string;
  timbreNoCertificadoSat?: string;
  fechaDePago?: string;
  montoPagado?: string;
  uuidRelacion?: string;
  tipoFactura?: string;
  linkPdf?: string;
  estado?: string;
}

function complementoPagoBody(params: ComplementoPagoInput) {
  return {
    version: params.version || null,
    timbre_uuid: params.timbreUuid || undefined,
    serie: params.serie || null,
    folio: params.folio || null,
    fecha: params.fecha || null,
    no_certificado: params.noCertificado || null,
    lugar_expedicion: params.lugarExpedicion || null,
    moneda: params.moneda || null,
    tipo_de_comprobante: params.tipoDeComprobante || null,
    exportacion: params.exportacion || null,
    sub_total: normalizaDecimal(params.subTotal),
    total: normalizaDecimal(params.total),
    emisor_rfc: params.emisorRfc || null,
    emisor_nombre: params.emisorNombre || null,
    emisor_regimen_fiscal: params.emisorRegimenFiscal || null,
    receptor_rfc: params.receptorRfc || null,
    receptor_nombre: params.receptorNombre || null,
    receptor_domicilio_fiscal_receptor: params.receptorDomicilioFiscalReceptor || null,
    receptor_regimen_fiscal_receptor: params.receptorRegimenFiscalReceptor || null,
    receptor_uso_cfdi: params.receptorUsoCfdi || null,
    timbre_version: params.timbreVersion || null,
    timbre_fecha_timbrado: params.timbreFechaTimbrado || null,
    timbre_rfc_prov_certif: params.timbreRfcProvCertif || null,
    timbre_no_certificado_sat: params.timbreNoCertificadoSat || null,
    fecha_de_pago: params.fechaDePago || null,
    monto_pagado: normalizaDecimal(params.montoPagado),
    uuid_relacion: params.uuidRelacion || null,
    tipo_factura: params.tipoFactura || null,
    link_pdf: params.linkPdf || null,
    estado: params.estado || null,
  };
}

export async function createComplementoPago(params: ComplementoPagoInput): Promise<TesoreriaComplementoPago> {
  const response = await apiFetch("TESORERIA", `${TESORERIA_API_BASE_URL}/api/complementos-pago/`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(complementoPagoBody(params)),
  });
  if (!response.ok) {
    throw await friendlyApiError("TESORERIA", response);
  }
  return response.json();
}

export async function updateComplementoPago(id: number, params: ComplementoPagoInput): Promise<TesoreriaComplementoPago> {
  const response = await apiFetch("TESORERIA", `${TESORERIA_API_BASE_URL}/api/complementos-pago/${id}/`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(complementoPagoBody(params)),
  });
  if (!response.ok) {
    throw await friendlyApiError("TESORERIA", response);
  }
  return response.json();
}

export async function deleteComplementoPago(id: number): Promise<void> {
  const response = await apiFetch("TESORERIA", `${TESORERIA_API_BASE_URL}/api/complementos-pago/${id}/`, {
    method: "DELETE",
  });
  if (!response.ok) {
    throw await friendlyApiError("TESORERIA", response);
  }
}

export interface TesoreriaNotaCredito {
  id: number;
  contraparte: string | null;
  contraparte_nombre: string | null;
  comprobante_version: string | null;
  comprobante_serie: string | null;
  comprobante_folio: string | null;
  comprobante_fecha: string | null;
  comprobante_forma_pago: string | null;
  comprobante_no_certificado: string | null;
  comprobante_sub_total: string | null;
  comprobante_moneda: string | null;
  comprobante_exportacion: string | null;
  comprobante_tipo_cambio: string | null;
  comprobante_total: string | null;
  comprobante_tipo_de_comprobante: string | null;
  comprobante_metodo_pago: string | null;
  comprobante_lugar_expedicion: string | null;
  tipo_relacion: string | null;
  uuid_relacionado: string | null;
  factura_folio: string | null;
  emisor_rfc: string | null;
  emisor_nombre: string | null;
  emisor_regimen_fiscal: string | null;
  receptor_rfc: string | null;
  receptor_nombre: string | null;
  receptor_domicilio_fiscal_receptor: string | null;
  receptor_regimen_fiscal_receptor: string | null;
  receptor_uso_cfdi: string | null;
  timbre_version: string | null;
  timbre_uuid: string;
  timbre_fecha_timbrado: string | null;
  timbre_rfc_prov_certif: string | null;
  timbre_no_certificado_sat: string | null;
  tipo_factura: string | null;
  link_pdf: string | null;
  estado: string | null;
  created_at: string;
  created_by: string | null;
  updated_at: string;
  updated_by: string | null;
}

export async function listNotasCredito(search?: string, contraparte?: string): Promise<TesoreriaNotaCredito[]> {
  const params = new URLSearchParams();
  if (search) params.set("search", search);
  if (contraparte) params.set("contraparte", contraparte);
  const response = await apiFetch("TESORERIA", `${TESORERIA_API_BASE_URL}/api/notas-credito/?${params.toString()}`);
  if (!response.ok) {
    throw await friendlyApiError("TESORERIA", response);
  }
  return response.json();
}

export interface NotaCreditoInput {
  comprobanteVersion?: string;
  comprobanteSerie?: string;
  comprobanteFolio?: string;
  comprobanteFecha?: string;
  comprobanteFormaPago?: string;
  comprobanteNoCertificado?: string;
  comprobanteSubTotal?: string;
  comprobanteMoneda?: string;
  comprobanteExportacion?: string;
  comprobanteTipoCambio?: string;
  comprobanteTotal?: string;
  comprobanteTipoDeComprobante?: string;
  comprobanteMetodoPago?: string;
  comprobanteLugarExpedicion?: string;
  tipoRelacion?: string;
  uuidRelacionado?: string;
  emisorRfc?: string;
  emisorNombre?: string;
  emisorRegimenFiscal?: string;
  receptorRfc?: string;
  receptorNombre?: string;
  receptorDomicilioFiscalReceptor?: string;
  receptorRegimenFiscalReceptor?: string;
  receptorUsoCfdi?: string;
  timbreVersion?: string;
  timbreUuid?: string;
  timbreFechaTimbrado?: string;
  timbreRfcProvCertif?: string;
  timbreNoCertificadoSat?: string;
  tipoFactura?: string;
  linkPdf?: string;
  estado?: string;
}

function notaCreditoBody(params: NotaCreditoInput) {
  return {
    comprobante_version: params.comprobanteVersion || null,
    comprobante_serie: params.comprobanteSerie || null,
    comprobante_folio: params.comprobanteFolio || null,
    comprobante_fecha: params.comprobanteFecha || null,
    comprobante_forma_pago: params.comprobanteFormaPago || null,
    comprobante_no_certificado: params.comprobanteNoCertificado || null,
    comprobante_sub_total: normalizaDecimal(params.comprobanteSubTotal),
    comprobante_moneda: params.comprobanteMoneda || null,
    comprobante_exportacion: params.comprobanteExportacion || null,
    comprobante_tipo_cambio: params.comprobanteTipoCambio || null,
    comprobante_total: normalizaDecimal(params.comprobanteTotal),
    comprobante_tipo_de_comprobante: params.comprobanteTipoDeComprobante || null,
    comprobante_metodo_pago: params.comprobanteMetodoPago || null,
    comprobante_lugar_expedicion: params.comprobanteLugarExpedicion || null,
    tipo_relacion: params.tipoRelacion || null,
    uuid_relacionado: params.uuidRelacionado || null,
    emisor_rfc: params.emisorRfc || null,
    emisor_nombre: params.emisorNombre || null,
    emisor_regimen_fiscal: params.emisorRegimenFiscal || null,
    receptor_rfc: params.receptorRfc || null,
    receptor_nombre: params.receptorNombre || null,
    receptor_domicilio_fiscal_receptor: params.receptorDomicilioFiscalReceptor || null,
    receptor_regimen_fiscal_receptor: params.receptorRegimenFiscalReceptor || null,
    receptor_uso_cfdi: params.receptorUsoCfdi || null,
    timbre_version: params.timbreVersion || null,
    timbre_uuid: params.timbreUuid || undefined,
    timbre_fecha_timbrado: params.timbreFechaTimbrado || null,
    timbre_rfc_prov_certif: params.timbreRfcProvCertif || null,
    timbre_no_certificado_sat: params.timbreNoCertificadoSat || null,
    tipo_factura: params.tipoFactura || null,
    link_pdf: params.linkPdf || null,
    estado: params.estado || null,
  };
}

export async function createNotaCredito(params: NotaCreditoInput): Promise<TesoreriaNotaCredito> {
  const response = await apiFetch("TESORERIA", `${TESORERIA_API_BASE_URL}/api/notas-credito/`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(notaCreditoBody(params)),
  });
  if (!response.ok) {
    throw await friendlyApiError("TESORERIA", response);
  }
  return response.json();
}

export async function updateNotaCredito(id: number, params: NotaCreditoInput): Promise<TesoreriaNotaCredito> {
  const response = await apiFetch("TESORERIA", `${TESORERIA_API_BASE_URL}/api/notas-credito/${id}/`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(notaCreditoBody(params)),
  });
  if (!response.ok) {
    throw await friendlyApiError("TESORERIA", response);
  }
  return response.json();
}

export async function deleteNotaCredito(id: number): Promise<void> {
  const response = await apiFetch("TESORERIA", `${TESORERIA_API_BASE_URL}/api/notas-credito/${id}/`, {
    method: "DELETE",
  });
  if (!response.ok) {
    throw await friendlyApiError("TESORERIA", response);
  }
}

export interface TesoreriaRecNomina {
  id: number;
  fecha: string | null;
  moneda: string | null;
  folio: string | null;
  sub_total: string | null;
  total: string | null;
  emisor_rfc: string | null;
  emisor_nombre: string | null;
  receptor_rfc: string | null;
  receptor_nombre: string | null;
  nom_receptor_num_empleado: string | null;
  nomina_fecha_pago: string | null;
  nomina_fecha_inicial_pago: string | null;
  nomina_fecha_final_pago: string | null;
  timbre_uuid: string | null;
  timbre_fecha_timbrado: string | null;
  tipo_factura: string | null;
  link_pdf: string | null;
  estado: string | null;
  created_at: string;
  created_by: string | null;
  updated_at: string;
  updated_by: string | null;
}

export async function listRecNominas(search?: string): Promise<TesoreriaRecNomina[]> {
  const params = new URLSearchParams();
  if (search) params.set("search", search);
  const response = await apiFetch("TESORERIA", `${TESORERIA_API_BASE_URL}/api/rec-nominas/?${params.toString()}`);
  if (!response.ok) {
    throw await friendlyApiError("TESORERIA", response);
  }
  return response.json();
}

export interface RecNominaInput {
  fecha?: string;
  moneda?: string;
  folio?: string;
  subTotal?: string;
  total?: string;
  emisorRfc?: string;
  emisorNombre?: string;
  receptorRfc?: string;
  receptorNombre?: string;
  nomReceptorNumEmpleado?: string;
  nominaFechaPago?: string;
  nominaFechaInicialPago?: string;
  nominaFechaFinalPago?: string;
  timbreUuid?: string;
  timbreFechaTimbrado?: string;
  tipoFactura?: string;
  linkPdf?: string;
  estado?: string;
}

function recNominaBody(params: RecNominaInput) {
  return {
    fecha: params.fecha || null,
    moneda: params.moneda || null,
    folio: params.folio || null,
    sub_total: normalizaDecimal(params.subTotal),
    total: normalizaDecimal(params.total),
    emisor_rfc: params.emisorRfc || null,
    emisor_nombre: params.emisorNombre || null,
    receptor_rfc: params.receptorRfc || null,
    receptor_nombre: params.receptorNombre || null,
    nom_receptor_num_empleado: params.nomReceptorNumEmpleado || null,
    nomina_fecha_pago: params.nominaFechaPago || null,
    nomina_fecha_inicial_pago: params.nominaFechaInicialPago || null,
    nomina_fecha_final_pago: params.nominaFechaFinalPago || null,
    timbre_uuid: params.timbreUuid || null,
    timbre_fecha_timbrado: params.timbreFechaTimbrado || null,
    tipo_factura: params.tipoFactura || null,
    link_pdf: params.linkPdf || null,
    estado: params.estado || null,
  };
}

export async function createRecNomina(params: RecNominaInput): Promise<TesoreriaRecNomina> {
  const response = await apiFetch("TESORERIA", `${TESORERIA_API_BASE_URL}/api/rec-nominas/`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(recNominaBody(params)),
  });
  if (!response.ok) {
    throw await friendlyApiError("TESORERIA", response);
  }
  return response.json();
}

export async function updateRecNomina(id: number, params: RecNominaInput): Promise<TesoreriaRecNomina> {
  const response = await apiFetch("TESORERIA", `${TESORERIA_API_BASE_URL}/api/rec-nominas/${id}/`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(recNominaBody(params)),
  });
  if (!response.ok) {
    throw await friendlyApiError("TESORERIA", response);
  }
  return response.json();
}

export async function deleteRecNomina(id: number): Promise<void> {
  const response = await apiFetch("TESORERIA", `${TESORERIA_API_BASE_URL}/api/rec-nominas/${id}/`, {
    method: "DELETE",
  });
  if (!response.ok) {
    throw await friendlyApiError("TESORERIA", response);
  }
}

// Saldo (bloque 5 de Tesoreria, ver piezas-de-tesoreria.html) - foto del
// saldo de una cuenta en una fecha, se ve como una "balanza" (paneles de
// cuadros agrupados por fecha, ver tesoreria/saldos/page.tsx). El backend
// documenta que esto se piensa llenar por proceso/carga de archivo, no
// dato por dato a mano (ver TesoreriaSaldoSerializer) - todavia no existe
// ese importador, asi que este cliente solo cubre la captura manual
// mientras tanto. `id` no se autogenera en el modelo (CharField sin
// default) - lo genera el llamador (ver generarIdSaldo() en la pagina,
// mismo formato hex corto que ya trae la captura real del AppSheet
// original), no se le pide al usuario que invente un ID.
export interface TesoreriaSaldo {
  id: string;
  fecha: string;
  cuenta: string;
  saldo: string;
  cambio_dinero: string | null;
  cambio_porcentual: string | null;
  created_at: string;
  created_by: string | null;
  updated_at: string;
  updated_by: string | null;
}

export async function listSaldos(cuenta?: string): Promise<TesoreriaSaldo[]> {
  const params = new URLSearchParams();
  if (cuenta) params.set("cuenta", cuenta);
  const response = await apiFetch("TESORERIA", `${TESORERIA_API_BASE_URL}/api/saldos/?${params.toString()}`);
  if (!response.ok) {
    throw await friendlyApiError("TESORERIA", response);
  }
  return response.json();
}

export async function createSaldo(params: {
  id: string;
  fecha: string;
  cuenta: string;
  saldo: string;
  cambioDinero?: string;
  cambioPorcentual?: string;
}): Promise<TesoreriaSaldo> {
  const response = await apiFetch("TESORERIA", `${TESORERIA_API_BASE_URL}/api/saldos/`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      id: params.id,
      fecha: params.fecha,
      cuenta: params.cuenta,
      saldo: params.saldo,
      cambio_dinero: params.cambioDinero || null,
      cambio_porcentual: params.cambioPorcentual || null,
    }),
  });
  if (!response.ok) {
    throw await friendlyApiError("TESORERIA", response);
  }
  return response.json();
}

export async function updateSaldo(
  id: string,
  params: Partial<{ saldo: string; cambioDinero: string; cambioPorcentual: string }>
): Promise<TesoreriaSaldo> {
  const response = await apiFetch("TESORERIA", `${TESORERIA_API_BASE_URL}/api/saldos/${id}/`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      saldo: params.saldo,
      cambio_dinero: params.cambioDinero,
      cambio_porcentual: params.cambioPorcentual,
    }),
  });
  if (!response.ok) {
    throw await friendlyApiError("TESORERIA", response);
  }
  return response.json();
}

export async function deleteSaldo(id: string): Promise<void> {
  const response = await apiFetch("TESORERIA", `${TESORERIA_API_BASE_URL}/api/saldos/${id}/`, {
    method: "DELETE",
  });
  if (!response.ok) {
    throw await friendlyApiError("TESORERIA", response);
  }
}
