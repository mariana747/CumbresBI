// Cliente del Motor Inteligente de Procesamiento Documental (docint).
// Contrato: services/document-intelligence-service/docint/views.py (POST /analyze).
// El archivo ya NO se sube directo del navegador (decision de Mariana,
// 12/Ago/2026, ver memoria de sesion "motor-documental-seleccion-archivos-
// drive"): el analista lo sube el mismo en drive.google.com; aqui solo se
// manda la referencia (driveFileId/carpeta/permKey). El analisis en si es
// async (202 + polling, ver pollAnalysis mas abajo).
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

// Espejo de docint/models.py::AnalysisJob.ESTADOS.
export type AnalysisStatus = "PENDIENTE" | "PROCESANDO" | "COMPLETADO" | "ERROR";

export interface AnalysisStatusResponse {
  analysis_id: string;
  status: AnalysisStatus;
  result: DocumentAnalysisResult | null;
  error: string | null;
}

// El analista sube el archivo el mismo en drive.google.com; aqui solo se
// manda la referencia (driveFileId/carpeta) + el perm_key que drive-service
// va a exigir para dejarlo leer esa carpeta.
export interface AnalyzeDocumentParams {
  driveFileId: string;
  carpeta: string;
  permKey: string;
  nombreArchivo: string;
  mimeType?: string;
  expectedDocumentType: string;
  // Cuando el llamador YA sabe con certeza el tipo documental (Tesoreria/
  // Facturas/Tickets de reembolso - ver comentario en
  // MotorDocumentalDialog.tsx sobre "el llamador ya sabe que tipo es"),
  // manda esto para que el backend use ese prompt directo en vez de
  // re-adivinar por nombre de archivo (views.py::AnalyzeView, "gana
  // siempre"). Bug real encontrado en prueba end-to-end 01/Sep/2026 (ver
  // memoria "docint-prompt-especifico-nunca-se-usa-por-tipo-conocido"):
  // antes nunca se mandaba, asi que tipos sin palabra clave en el nombre
  // del archivo (ej. comprobantes bancarios) siempre caian a "generic".
  // Omitir para PLD, que si necesita adivinar por archivo.
  internalPromptKey?: string;
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

// Encola el analisis y regresa de inmediato (202 + analysis_id) - ya NO
// espera el resultado, ver docint/views.py::AnalyzeView. Usar junto con
// pollAnalysis.
export async function analyzeDocument({
  driveFileId,
  carpeta,
  permKey,
  nombreArchivo,
  mimeType,
  expectedDocumentType,
  internalPromptKey,
  servicioSolicitante,
  metadata,
}: AnalyzeDocumentParams): Promise<{ analysisId: string; status: AnalysisStatus }> {
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
      internal_prompt_key: internalPromptKey,
      servicio_solicitante: servicioSolicitante,
      metadata: metadata ? JSON.stringify(metadata) : undefined,
    }),
  });

  if (!response.ok) {
    throw await friendlyApiError("DOCINT", response);
  }

  const body = await response.json();
  return { analysisId: body.analysis_id, status: body.status };
}

export async function getAnalysisStatus(analysisId: string): Promise<AnalysisStatusResponse> {
  const response = await apiFetch("DOCINT", `${DOCINT_API_BASE_URL}/analyze/${analysisId}/status`, {
    method: "GET",
  });

  if (!response.ok) {
    throw await friendlyApiError("DOCINT", response);
  }

  return response.json();
}

// Backoff simple (2s, 3s, 5s, luego cada 5s) hasta ver COMPLETADO/ERROR o
// agotar timeoutMs - un analisis real con Gemini rara vez tarda mas de
// unos segundos, pero el limite evita que el usuario se quede viendo
// "Procesando" para siempre si algo se atoro sin marcarse ERROR.
const BACKOFF_MS = [2000, 3000, 5000];

export async function pollAnalysis(
  analysisId: string,
  { timeoutMs = 120_000 }: { timeoutMs?: number } = {}
): Promise<AnalysisStatusResponse> {
  const start = Date.now();
  let intento = 0;

  // eslint-disable-next-line no-constant-condition
  while (true) {
    const estado = await getAnalysisStatus(analysisId);
    if (estado.status === "COMPLETADO" || estado.status === "ERROR") {
      return estado;
    }
    if (Date.now() - start > timeoutMs) {
      throw new Error("El análisis está tardando más de lo esperado. Intenta de nuevo. (DOCINT-timeout)");
    }
    const espera = BACKOFF_MS[Math.min(intento, BACKOFF_MS.length - 1)];
    intento += 1;
    await new Promise((resolve) => setTimeout(resolve, espera));
  }
}
