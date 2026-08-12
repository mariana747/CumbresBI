"use client";

import { useEffect, useState } from "react";
import {
  Accordion,
  AccordionDetails,
  AccordionSummary,
  Alert,
  Box,
  Button,
  Chip,
  CircularProgress,
  Dialog,
  DialogContent,
  DialogTitle,
  Divider,
  FormControl,
  IconButton,
  InputLabel,
  List,
  ListItem,
  ListItemText,
  MenuItem,
  Select,
  Stack,
  Typography,
} from "@mui/material";
import { CheckCircle2, ChevronDown, CloudUpload, UploadCloud, X as CloseIcon } from "lucide-react";
import { confirmarEnvioDrive } from "@/lib/audit";
import { analyzeDocument, DocumentAnalysisResult, guessDocumentTypeFromFilename } from "@/lib/docint";
import { PLD_CAMPOS_CONFIRMABLES, PldContraparteKyc, confirmarExtraccionKyc, listKyc } from "@/lib/pld";

// Etiquetas legibles de los tipos que el clasificador reconoce (espejo de
// docint/classifier.py, KEYWORD_TO_PROMPT_KEY) - solo para mostrar el tipo
// autodetectado de forma amigable, no es un selector manual.
const DOCUMENT_TYPE_LABELS: Record<string, string> = {
  "pld.ine": "INE / IFE",
  "pld.curp": "CURP",
  "pld.acta_nacimiento": "Acta de nacimiento",
  "pld.acta_constitutiva": "Acta constitutiva",
  "pld.comprobante_domicilio": "Comprobante de domicilio",
  "pld.constancia_fiscal": "Constancia de situación fiscal",
  "compras.cotizacion": "Cotización",
  "compras.factura_proveedor": "Factura / CFDI de proveedor",
  "materiales.presupuesto": "Presupuesto",
  generic: "Genérico (sin tipo esperado)",
};

// Microservicios consumidores actuales (services/*), identifican quien pide
// el analisis para el log operacional (AnalysisRequestLog.servicio_solicitante)
// - no afecta el resultado del analisis, solo trazabilidad de quien llamo.
//
// TODO(auth): esta lista debe filtrarse por el EffectiveScope/rol del usuario
// en sesion (ver docs/architecture/roles-y-permisos.md) - ej. un usuario con
// solo PLD_ANALISTA no deberia poder elegir "rrhh-service" aqui. No
// implementado todavia porque el login sigue siendo un placeholder (Fase 0,
// sin JWT real llegando al frontend) - ver src/app/login/page.tsx.
const SERVICIOS_SOLICITANTES = [
  "pld-service",
  "compras-tesoreria-service",
  "tesoreria-service",
  "rentas-service",
  "vivienda-service",
  "rrhh-service",
] as const;

interface DocumentResult {
  file: File;
  expectedDocumentType: string;
  result?: DocumentAnalysisResult;
  error?: string;
  driveConfirmadoEn?: string;
  // Expediente KYC elegido para volcar los datos ya validados (solo aplica
  // a servicioSolicitante === "pld-service", ver confirmar_extraccion en
  // pld-service). undefined mientras el analista no elige uno.
  kycSeleccionado?: string;
  extraccionConfirmadaEn?: string;
  extraccionError?: string;
}

// Motor Inteligente de Procesamiento Documental (docint) - ver
// docs/architecture/README.md sec. 10. Fase 0: modo dev sin Drive, el
// archivo se sube directo (ver services/document-intelligence-service/
// docint/views.py). Solo usar con documentos ficticios.
//
// Modulo emergente (confirmado por el cliente): se invoca como dialogo desde
// cualquier pantalla que necesite analizar un documento (ej. un formulario de
// PLD o Compras con boton "Analizar documento"), no como una pagina propia -
// por eso vive en components/ y no en app/.
//
// Carga multiple (confirmado por el cliente): para armar el expediente de una
// persona (INE, CURP, comprobante, etc.) de un jalon, se seleccionan varios
// archivos a la vez y cada uno se etiqueta solo (autodeteccion por nombre,
// ver guessDocumentTypeFromFilename) - sin pedirle al usuario que capture el
// tipo archivo por archivo. El backend sigue recibiendo un POST /analyze por
// archivo (no soporta batch), asi que aqui se hace un fetch por documento.
export default function MotorDocumentalDialog({
  open,
  onClose,
}: {
  open: boolean;
  onClose: () => void;
}) {
  const [documents, setDocuments] = useState<DocumentResult[]>([]);
  // Tipado explicito: SERVICIOS_SOLICITANTES es "as const" (tupla de
  // literales), asi que SERVICIOS_SOLICITANTES[0] solo, sin el generic,
  // infiere el tipo mas angosto ("pld-service" a secas) - el setter
  // entonces rechaza cualquier otro valor del propio arreglo.
  const [servicioSolicitante, setServicioSolicitante] = useState<(typeof SERVICIOS_SOLICITANTES)[number]>(
    SERVICIOS_SOLICITANTES[0]
  );
  const [loading, setLoading] = useState(false);

  // Expedientes KYC existentes, para que el analista elija a cual volcar los
  // datos ya validados (solo tiene sentido cuando servicioSolicitante ===
  // "pld-service" - es el unico consumidor con endpoint de confirmacion
  // hoy, ver services/pld-service/pld/views.py::confirmar_extraccion).
  const [kycOptions, setKycOptions] = useState<PldContraparteKyc[]>([]);

  useEffect(() => {
    if (!open || servicioSolicitante !== "pld-service") return;
    listKyc()
      .then(setKycOptions)
      .catch(() => setKycOptions([]));
  }, [open, servicioSolicitante]);

  function handleFilesSelected(fileList: FileList | null) {
    if (!fileList) return;
    const newDocuments = Array.from(fileList).map((file) => ({
      file,
      expectedDocumentType: guessDocumentTypeFromFilename(file.name),
    }));
    setDocuments((prev) => [...prev, ...newDocuments]);
  }

  function handleKycSeleccionado(index: number, kycId: string) {
    setDocuments((prev) =>
      prev.map((d, i) => (i === index ? { ...d, kycSeleccionado: kycId, extraccionError: undefined } : d))
    );
  }

  // Reemplaza la descarga local de JSON (docs/architecture/README.md sec.
  // 1.1 dejo de aplicar: ya existe confirmar_extraccion en pld-service).
  // Solo manda las llaves de extracted_data que el expediente realmente
  // puede guardar (PLD_CAMPOS_CONFIRMABLES, espejo de
  // PldContraparteKycViewSet.CAMPOS_CONFIRMABLES) - el resto (ej.
  // "nombre_completo", "clave_elector") no tiene columna propia en este
  // modelo y se descarta aqui mismo, antes de llamar al backend.
  async function handleConfirmarExtraccion(index: number) {
    const doc = documents[index];
    if (!doc.result || !doc.kycSeleccionado) return;

    const campos = Object.fromEntries(
      Object.entries(doc.result.extracted_data).filter(
        ([key, value]) => value !== null && (PLD_CAMPOS_CONFIRMABLES as readonly string[]).includes(key)
      )
    );
    if (Object.keys(campos).length === 0) {
      setDocuments((prev) =>
        prev.map((d, i) =>
          i === index
            ? { ...d, extraccionError: "Ningún dato extraído coincide con campos guardables del expediente." }
            : d
        )
      );
      return;
    }

    try {
      await confirmarExtraccionKyc(doc.kycSeleccionado, campos);
      setDocuments((prev) =>
        prev.map((d, i) =>
          i === index ? { ...d, extraccionConfirmadaEn: new Date().toISOString(), extraccionError: undefined } : d
        )
      );
    } catch (err) {
      setDocuments((prev) =>
        prev.map((d, i) =>
          i === index
            ? { ...d, extraccionError: err instanceof Error ? err.message : "Error al confirmar la extracción" }
            : d
        )
      );
    }
  }

  // Confirmacion de envio a Drive (docs/architecture/README.md sec. 10:
  // streaming via Drive API todavia bloqueado por falta del proyecto GCP,
  // ver docint/drive.py). NO sube nada real a Drive - solo registra en la
  // bitacora de auditoria que el usuario confirmo la intencion, con formato
  // (PDF) y la fecha/hora en que se consulto el documento. Reemplazar por
  // el envio real cuando exista esa integracion.
  async function handleConfirmarDrive(index: number) {
    const doc = documents[index];
    const consultadoEn = new Date().toISOString();
    try {
      await confirmarEnvioDrive({ entidadId: doc.file.name, consultadoEn });
      setDocuments((prev) =>
        prev.map((d, i) => (i === index ? { ...d, driveConfirmadoEn: consultadoEn } : d))
      );
    } catch (err) {
      setDocuments((prev) =>
        prev.map((d, i) =>
          i === index
            ? { ...d, error: err instanceof Error ? err.message : "Error al confirmar envío a Drive" }
            : d
        )
      );
    }
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (documents.length === 0) return;
    setLoading(true);
    try {
      const analyzed = await Promise.all(
        documents.map(async (doc) => {
          try {
            const result = await analyzeDocument({
              file: doc.file,
              expectedDocumentType: doc.expectedDocumentType,
              servicioSolicitante: servicioSolicitante || "desconocido",
            });
            return { ...doc, result, error: undefined };
          } catch (err) {
            return { ...doc, error: err instanceof Error ? err.message : "Error desconocido" };
          }
        })
      );
      setDocuments(analyzed);
    } finally {
      setLoading(false);
    }
  }

  const hasResults = documents.some((doc) => doc.result || doc.error);

  // Cerrar el dialogo (X, Escape o clic afuera) NO debe perder lo ya
  // extraido - volver a analizar cuesta tokens de la IA. Por eso "cerrar" y
  // "borrar" son acciones distintas: cerrar solo oculta el dialogo
  // (el estado sigue vivo en este componente, sin desmontarse, mientras el
  // padre no cambie `open`); "Borrar todo" es la unica accion que limpia
  // `documents` de verdad.
  function handleClose(_event?: unknown, reason?: "backdropClick" | "escapeKeyDown") {
    if (reason === "backdropClick" || reason === "escapeKeyDown") return;
    onClose();
  }

  function handleBorrarTodo() {
    setDocuments([]);
    setServicioSolicitante(SERVICIOS_SOLICITANTES[0]);
  }

  return (
    <Dialog open={open} onClose={handleClose} fullWidth maxWidth="sm">
      <DialogTitle sx={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        Motor Documental
        <IconButton onClick={() => onClose()} size="small" aria-label="Cerrar">
          <CloseIcon size={18} strokeWidth={1.5} />
        </IconButton>
      </DialogTitle>
      <DialogContent dividers>
        <Typography variant="body2" color="text.secondary" sx={{ mb: 3 }}>
          Análisis de documentos con IA — modo desarrollo (subida directa, sin
          integración con Google Drive todavía). Usar solo con documentos
          ficticios. Puedes seleccionar varios archivos a la vez (ej. INE,
          CURP y comprobante de la misma persona); el tipo se autodetecta por
          el nombre del archivo.
        </Typography>

        <Stack component="form" spacing={2} onSubmit={handleSubmit}>
          <Button
            component="label"
            variant="outlined"
            startIcon={<UploadCloud size={18} strokeWidth={1.5} />}
            sx={{ justifyContent: "flex-start" }}
          >
            {documents.length > 0
              ? `${documents.length} archivo(s) seleccionado(s)`
              : "Seleccionar archivos"}
            <input
              type="file"
              hidden
              multiple
              onChange={(e) => handleFilesSelected(e.target.files)}
            />
          </Button>

          {documents.length > 0 && (
            <List dense sx={{ bgcolor: "background.default", borderRadius: 1 }}>
              {documents.map((doc, index) => (
                <ListItem
                  key={`${doc.file.name}-${index}`}
                  secondaryAction={
                    <IconButton
                      edge="end"
                      size="small"
                      aria-label="Quitar"
                      onClick={() => setDocuments((prev) => prev.filter((_, i) => i !== index))}
                    >
                      <CloseIcon size={16} strokeWidth={1.5} />
                    </IconButton>
                  }
                >
                  <ListItemText
                    primary={doc.file.name}
                    secondary={DOCUMENT_TYPE_LABELS[doc.expectedDocumentType] ?? doc.expectedDocumentType}
                  />
                </ListItem>
              ))}
            </List>
          )}

          <FormControl size="small" fullWidth>
            <InputLabel id="servicio-solicitante-label">Servicio solicitante</InputLabel>
            <Select
              labelId="servicio-solicitante-label"
              label="Servicio solicitante"
              value={servicioSolicitante}
              onChange={(e) => setServicioSolicitante(e.target.value as (typeof SERVICIOS_SOLICITANTES)[number])}
            >
              {SERVICIOS_SOLICITANTES.map((servicio) => (
                <MenuItem key={servicio} value={servicio}>
                  {servicio}
                </MenuItem>
              ))}
            </Select>
            <Typography variant="caption" color="text.secondary" sx={{ mt: 0.5, px: 0.5 }}>
              Microservicio interno que pide el análisis (para trazabilidad del
              log, no afecta el resultado) — ej. quién validará este documento.
            </Typography>
          </FormControl>

          <Button type="submit" variant="contained" disabled={loading || documents.length === 0}>
            {loading ? (
              <CircularProgress size={20} color="inherit" />
            ) : (
              `Analizar ${documents.length > 1 ? `${documents.length} documentos` : "documento"}`
            )}
          </Button>
        </Stack>

        {hasResults && (
          <Box sx={{ mt: 3 }}>
            <Divider sx={{ mb: 2 }} />
            <Stack direction="row" justifyContent="space-between" alignItems="center" sx={{ mb: 1.5 }}>
              <Typography variant="subtitle1" fontWeight={600}>
                Resultados
              </Typography>
              <Button size="small" color="error" onClick={handleBorrarTodo}>
                Borrar todo
              </Button>
            </Stack>

            {documents.map((doc, index) => (
              <Accordion key={`${doc.file.name}-${index}`} defaultExpanded={documents.length === 1}>
                <AccordionSummary expandIcon={<ChevronDown size={18} strokeWidth={1.5} />}>
                  <Stack direction="row" spacing={1} alignItems="center" sx={{ flex: 1, minWidth: 0 }}>
                    <Typography variant="body2" noWrap sx={{ flex: 1 }}>
                      {doc.file.name}
                    </Typography>
                    {doc.result && (
                      <Chip
                        size="small"
                        label={doc.result.matches_expected_type ? "Coincide" : "No coincide"}
                        color={doc.result.matches_expected_type ? "success" : "warning"}
                      />
                    )}
                    {doc.error && <Chip size="small" label="Error" color="error" />}
                  </Stack>
                </AccordionSummary>
                <AccordionDetails>
                  {doc.error && <Alert severity="error">{doc.error}</Alert>}

                  {doc.result && (
                    <Stack spacing={1.5}>
                      <Typography variant="body2">
                        Tipo detectado: <strong>{doc.result.detected_document_type ?? "—"}</strong>
                      </Typography>
                      <Typography variant="body2">
                        Confianza: <strong>{(doc.result.confidence * 100).toFixed(0)}%</strong>
                      </Typography>
                      <Typography variant="body2" color="text.secondary">
                        Prompt usado: {doc.result.internal_prompt_key_used}
                        {doc.result.matched_by_filename === false &&
                          " (clasificación genérica, no confiable)"}
                      </Typography>

                      {doc.result.validation_errors.length > 0 && (
                        <Alert severity="error">{doc.result.validation_errors.join(" · ")}</Alert>
                      )}
                      {doc.result.warnings.length > 0 && (
                        <Alert severity="warning">{doc.result.warnings.join(" · ")}</Alert>
                      )}

                      <Typography variant="subtitle2">Datos extraídos</Typography>
                      <Box
                        component="pre"
                        sx={{
                          fontFamily: "var(--font-dm-mono, monospace)",
                          fontSize: 12,
                          bgcolor: "background.default",
                          p: 1.5,
                          borderRadius: 1,
                          overflow: "auto",
                        }}
                      >
                        {JSON.stringify(doc.result.extracted_data, null, 2)}
                      </Box>

                      {servicioSolicitante === "pld-service" &&
                        (doc.extraccionConfirmadaEn ? (
                          <Alert severity="success">
                            Datos confirmados en el expediente el{" "}
                            {new Date(doc.extraccionConfirmadaEn).toLocaleString("es-MX")}.
                          </Alert>
                        ) : (
                          <Stack spacing={1}>
                            <FormControl size="small" fullWidth>
                              <InputLabel id={`kyc-select-${index}`}>Expediente KYC destino</InputLabel>
                              <Select
                                labelId={`kyc-select-${index}`}
                                label="Expediente KYC destino"
                                value={doc.kycSeleccionado ?? ""}
                                onChange={(e) => handleKycSeleccionado(index, e.target.value)}
                              >
                                {kycOptions.map((kyc) => (
                                  <MenuItem key={kyc.id_kyc} value={kyc.id_kyc}>
                                    {kyc.id_contraparte} ({kyc.id_kyc})
                                  </MenuItem>
                                ))}
                              </Select>
                            </FormControl>
                            {doc.extraccionError && <Alert severity="error">{doc.extraccionError}</Alert>}
                            <Button
                              size="small"
                              variant="contained"
                              startIcon={<CheckCircle2 size={16} strokeWidth={1.5} />}
                              disabled={!doc.kycSeleccionado}
                              onClick={() => handleConfirmarExtraccion(index)}
                              sx={{ alignSelf: "flex-start" }}
                            >
                              Confirmar y guardar en el expediente
                            </Button>
                          </Stack>
                        ))}

                      {doc.driveConfirmadoEn ? (
                        <Alert severity="info">
                          Envío a Drive confirmado el{" "}
                          {new Date(doc.driveConfirmadoEn).toLocaleString("es-MX")} (como PDF) — pendiente
                          de conexión real con Google Drive.
                        </Alert>
                      ) : (
                        <Button
                          size="small"
                          variant="outlined"
                          startIcon={<CloudUpload size={16} strokeWidth={1.5} />}
                          onClick={() => handleConfirmarDrive(index)}
                          sx={{ alignSelf: "flex-start" }}
                        >
                          Confirmar envío a Drive
                        </Button>
                      )}
                    </Stack>
                  )}
                </AccordionDetails>
              </Accordion>
            ))}
          </Box>
        )}
      </DialogContent>
    </Dialog>
  );
}
