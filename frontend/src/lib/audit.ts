// Cliente de audit-service - confirmacion de envio a Drive (Motor Documental).
// Contrato: services/audit-service/auditoria/views.py (POST
// /api/bitacora/confirmar_envio_drive/).

export interface BitacoraEvento {
  event_id: string;
  servicio_origen: string;
  actor_user_id: string;
  accion: string;
  entidad: string;
  entidad_id: string;
  valores_previos: Record<string, unknown> | null;
  valores_nuevos: Record<string, unknown> | null;
  ocurrido_en: string;
  recibido_en: string;
}

const AUDIT_API_BASE_URL = process.env.NEXT_PUBLIC_AUDIT_API_BASE_URL ?? "http://localhost:8001";

// Boton de confirmacion de envio a Drive (Motor Documental) - NO sube nada
// real a Drive (ver services/document-intelligence-service/docint/drive.py,
// bloqueado por falta del proyecto GCP). Solo deja constancia en la
// bitacora de que el usuario confirmo la intencion, con formato y la fecha/
// hora en que se consulto el documento.
export async function confirmarEnvioDrive({
  entidadId,
  consultadoEn,
}: {
  entidadId: string;
  consultadoEn: string;
}): Promise<BitacoraEvento> {
  const response = await fetch(`${AUDIT_API_BASE_URL}/api/bitacora/confirmar_envio_drive/`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      entidad_id: entidadId,
      servicio_origen: "document-intelligence-service",
      entidad: "documento_analizado",
      consultado_en: consultadoEn,
    }),
  });
  if (!response.ok) {
    const body = await response.text();
    throw new Error(`Error de audit-service (${response.status}): ${body}`);
  }
  return response.json();
}
