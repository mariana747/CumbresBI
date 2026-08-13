// Cliente del Motor Inteligente de Procesamiento Documental (docint).
// Contrato: services/document-intelligence-service/docint/views.py (POST /analyze).
// Modo actual = dev sin Drive: el archivo se sube directo en el body
// multipart. Cuando la integracion con Google Drive este lista (bloqueada
// por Actividad 1, ver docint/drive.py), este campo cambia de `file` a un
// identificador de Drive sin que la UI del formulario deba rediseñarse.
import { apiFetch, friendlyApiError } from "./apiError";
import { GATEWAY_URL } from "./gatewayUrl";

export interface DocumentAnalysisResult {
  detected_document_type: string | null;
  matches_expected_type: boolean;
  confidence: number;
  extracted_data: Record<string, unknown>;
  validation_errors: string[];
  warnings: string[];
  internal_prompt_key_used: string;
  matched_by_filename: boolean | null;
}

// Ya NO se manda el archivo directo del navegador (decision de Mariana,
// 12/Ago/2026, ver memoria de sesion
// "motor-documental-seleccion-archivos-drive"): el analista sube el
// archivo el mismo en drive.google.com; aqui solo se manda la referencia
// (driveFileId/carpeta) + el perm_key que drive-service va a exigir para
// dejarlo leer esa carpeta.
export interface AnalyzeDocumentParams {
  driveFileId: string;
  carpeta: string;
  permKey: string;
  nombreArchivo: string;
  mimeType?: string;
  expectedDocumentType: string;
  servicioSolicitante: string;
  metadata?: Record<string, unknown>;
}

const DOCINT_API_BASE_URL =
  process.env.NEXT_PUBLIC_DOCINT_API_BASE_URL ?? `${GATEWAY_URL}/docint`;

// Espejo en cliente de docint/classifier.py (KEYWORD_TO_PROMPT_KEY) - se usa
// para autollenar expected_document_type al subir varios archivos sin pedirle
// al usuario que etiquete cada uno a mano. El backend vuelve a clasificar por
// su cuenta con la misma logica (internal_prompt_key), asi que un desajuste
// aqui solo afecta el campo informativo "coincide con lo esperado", no el
// resultado real del analisis.
const KEYWORD_TO_DOCUMENT_TYPE: Record<string, string> = {
  ine: "pld.ine",
  ife: "pld.ine",
  identificacion: "pld.ine",
  credencialvotar: "pld.ine",
  actanacimiento: "pld.acta_nacimiento",
  actaconstitutiva: "pld.acta_constitutiva",
  constitutiva: "pld.acta_constitutiva",
  comprobantedomicilio: "pld.comprobante_domicilio",
  domicilio: "pld.comprobante_domicilio",
  cfe: "pld.comprobante_domicilio",
  recibolu: "pld.comprobante_domicilio",
  constanciafiscal: "pld.constancia_fiscal",
  situacionfiscal: "pld.constancia_fiscal",
  rfc: "pld.constancia_fiscal",
  curp: "pld.curp",
  cotizacion: "compras.cotizacion",
  factura: "compras.factura_proveedor",
  cfdi: "compras.factura_proveedor",
  presupuesto: "materiales.presupuesto",
};

function normalizeFilename(filename: string): string {
  const withoutExt = filename.includes(".") ? filename.slice(0, filename.lastIndexOf(".")) : filename;
  return withoutExt
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]/g, "");
}

export function guessDocumentTypeFromFilename(filename: string): string {
  const normalized = normalizeFilename(filename);
  for (const [keyword, documentType] of Object.entries(KEYWORD_TO_DOCUMENT_TYPE)) {
    if (normalized.includes(keyword)) return documentType;
  }
  return "generic";
}

export async function analyzeDocument({
  driveFileId,
  carpeta,
  permKey,
  nombreArchivo,
  mimeType,
  expectedDocumentType,
  servicioSolicitante,
  metadata,
}: AnalyzeDocumentParams): Promise<DocumentAnalysisResult> {
  const response = await apiFetch("DOCINT", `${DOCINT_API_BASE_URL}/analyze`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      drive_file_id: driveFileId,
      carpeta,
      perm_key: permKey,
      nombre_archivo: nombreArchivo,
      mime_type: mimeType,
      expected_document_type: expectedDocumentType,
      servicio_solicitante: servicioSolicitante,
      metadata: metadata ? JSON.stringify(metadata) : undefined,
    }),
  });

  if (!response.ok) {
    throw await friendlyApiError("DOCINT", response);
  }

  return response.json();
}
