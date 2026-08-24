"use client";

import { useEffect, useState } from "react";
import {
  Accordion,
  AccordionDetails,
  AccordionSummary,
  Alert,
  Box,
  Button,
  Checkbox,
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
  ListItemButton,
  ListItemIcon,
  ListItemText,
  MenuItem,
  Select,
  Stack,
  Typography,
} from "@mui/material";
import { CheckCircle2, ChevronDown, FolderSearch, X as CloseIcon } from "lucide-react";
import { DriveArchivo, listDriveFiles } from "@/lib/drive";
import {
  analyzeDocument,
  AnalysisStatus,
  DocumentAnalysisResult,
  guessDocumentTypeFromFilename,
  pollAnalysis,
} from "@/lib/docint";
import { PLD_CAMPOS_CONFIRMABLES, PldContraparteKyc, confirmarExtraccionKyc, listKyc } from "@/lib/pld";
import { getSession } from "@/lib/auth";

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
// Solo "pld-service" tiene hoy una carpeta de Drive real resuelta (ver
// `carpeta` mas abajo, PLD/<id_contraparte>) - los demas quedan listados
// para trazabilidad pero sin carpeta que listar todavia (memoria de sesion
// "motor-documental-seleccion-archivos-drive").
const SERVICIOS_SOLICITANTES = [
  "pld-service",
  "compras-tesoreria-service",
  "tesoreria-service",
  "rentas-service",
  "vivienda-service",
  "rrhh-service",
] as const;

// Contexto generico (24/Ago/2026) - permite reusar este mismo dialogo desde
// cualquier pantalla que ya sepa exactamente a que registro va a confirmar
// la extraccion (ej. /tesoreria/facturas), sin pasar por los selectores de
// "servicio solicitante"/"expediente KYC" que son especificos de PLD.
// Mutuamente excluyente con kycPreseleccionado - si se manda `contexto`,
// se ignora cualquier logica de PLD (carpeta/permKey/confirmar propios).
export interface MotorDocumentalContexto {
  // Texto libre mostrado en el aviso superior, ej. "factura F-00458".
  etiqueta: string;
  servicioSolicitante: string;
  carpeta: string;
  permKey: string;
  // Si se manda, se usa igual para todos los archivos analizados en esta
  // sesion del dialogo (a diferencia del modo PLD, que adivina un tipo por
  // archivo via guessDocumentTypeFromFilename - aqui el llamador ya sabe
  // que todo lo que se sube a esta carpeta es del mismo tipo de documento).
  expectedDocumentType?: string;
  camposConfirmables: readonly string[];
  onConfirmar: (campos: Record<string, unknown>) => Promise<void>;
}

interface DocumentResult {
  archivo: DriveArchivo;
  expectedDocumentType: string;
  result?: DocumentAnalysisResult;
  error?: string;
  // Estado del analisis async (docint/models.py::AnalysisJob) -
  // "PENDIENTE"/"PROCESANDO" mientras se hace polling, undefined antes de
  // mandar a analizar. analysisId solo sirve para el polling en curso, no
  // se muestra en la UI.
  estadoAnalisis?: AnalysisStatus;
  analysisId?: string;
  extraccionConfirmadaEn?: string;
  extraccionError?: string;
}

// Motor Inteligente de Procesamiento Documental (docint) - ver
// docs/architecture/README.md sec. 10. Decision de Mariana (12/Ago/2026,
// ver memoria de sesion "motor-documental-seleccion-archivos-drive"): ya
// NO se suben archivos locales - el analista sube el archivo el mismo en
// drive.google.com (a la carpeta correspondiente); este dialogo solo
// LISTA lo que ya esta ahi y lo manda a analizar por referencia
// (streaming Drive->Gemini, ver docint/drive.py).
//
// Modulo emergente (confirmado por el cliente): se invoca como dialogo desde
// cualquier pantalla que necesite analizar un documento, no como una pagina
// propia - por eso vive en components/ y no en app/.
export default function MotorDocumentalDialog({
  open,
  onClose,
  kycPreseleccionado,
  onDatosActualizados,
  contexto,
}: {
  open: boolean;
  onClose: () => void;
  // Se dispara justo despues de confirmar una extraccion con exito
  // (17/Ago/2026) - para que la pantalla que abrio el dialogo (ej. la
  // pestaña "Informacion general" de /pld/[idKyc]) pueda refrescar sus
  // propios datos sin esperar a que el usuario cierre el dialogo o
  // recargue la pagina a mano.
  onDatosActualizados?: () => void;
  // Cuando se abre desde el detalle de un expediente (/pld/[idKyc],
  // 17/Ago/2026) - se salta el selector de servicio/expediente por
  // completo, ya se sabe de que cliente se trata. Sin esto (uso desde
  // cualquier otra pantalla, si algun dia aplica), se comporta como antes:
  // el analista elige servicio + expediente a mano.
  kycPreseleccionado?: { id_kyc: string; id_contraparte: string };
  // Ver docstring de MotorDocumentalContexto arriba - alterna este dialogo
  // a modo generico para cualquier otro modulo (Facturacion CFDI hoy).
  contexto?: MotorDocumentalContexto;
}) {
  // Tipado explicito: SERVICIOS_SOLICITANTES es "as const" (tupla de
  // literales), asi que SERVICIOS_SOLICITANTES[0] solo, sin el generic,
  // infiere el tipo mas angosto ("pld-service" a secas) - el setter
  // entonces rechaza cualquier otro valor del propio arreglo.
  const [servicioSolicitante, setServicioSolicitante] = useState<(typeof SERVICIOS_SOLICITANTES)[number]>(
    SERVICIOS_SOLICITANTES[0]
  );
  const [loading, setLoading] = useState(false);

  // Expedientes KYC existentes - determinan la carpeta de Drive a listar
  // (PLD/<id_contraparte>/) y, mas adelante, a cual expediente se
  // confirman los datos ya validados. Solo aplica a "pld-service", el
  // unico consumidor con carpeta real resuelta hoy. Si viene
  // kycPreseleccionado, no hace falta cargar la lista completa - ya se
  // sabe exactamente cual expediente es.
  const [kycOptions, setKycOptions] = useState<PldContraparteKyc[]>([]);
  const [kycSeleccionado, setKycSeleccionado] = useState(kycPreseleccionado?.id_kyc ?? "");

  // "Nuevos Clientes" (17/Ago/2026, pedido de Mariana): mismo prefijo que
  // pld/views.py (subir/subir_documento) - subcarpeta fija dentro de la
  // Unidad compartida PLD_CumbresBI, no la raiz directa.
  const carpeta = contexto
    ? contexto.carpeta
    : kycPreseleccionado
      ? `PLD/Nuevos Clientes/${kycPreseleccionado.id_contraparte}`
      : kycSeleccionado
        ? `PLD/Nuevos Clientes/${kycOptions.find((k) => k.id_kyc === kycSeleccionado)?.id_contraparte}`
        : "";
  const permKey = contexto ? contexto.permKey : "pld-compliance.crear";
  // Habilita "Analizar"/"Confirmar" - en modo contexto no depende de elegir
  // un expediente KYC, el llamador ya trae su propio destino resuelto.
  const destinoListo = contexto ? true : !!kycSeleccionado;

  const [driveFiles, setDriveFiles] = useState<DriveArchivo[]>([]);
  const [loadingDriveFiles, setLoadingDriveFiles] = useState(false);
  const [driveError, setDriveError] = useState<string | null>(null);
  const [seleccionados, setSeleccionados] = useState<Set<string>>(new Set());

  const [documents, setDocuments] = useState<DocumentResult[]>([]);

  // Actor real de "confirmar_extraccion" para la auditoria del Motor
  // Documental (ver pld/audit_utils.py) - este dialogo no llevaba sesion
  // hasta ahora, asi que el evento se registraba sin analista identificado.
  const [actorUserId, setActorUserId] = useState<string | null>(null);
  useEffect(() => {
    getSession()
      .then((s) => setActorUserId(s?.user_id ?? null))
      .catch(() => setActorUserId(null));
  }, []);

  useEffect(() => {
    if (!open || contexto || kycPreseleccionado || servicioSolicitante !== "pld-service") return;
    listKyc()
      .then(setKycOptions)
      .catch(() => setKycOptions([]));
  }, [open, servicioSolicitante, kycPreseleccionado, contexto]);

  async function handleVerArchivosDrive() {
    if (!carpeta) return;
    setLoadingDriveFiles(true);
    setDriveError(null);
    try {
      const archivos = await listDriveFiles(carpeta, permKey);
      setDriveFiles(archivos);
      setSeleccionados(new Set());
    } catch (err) {
      setDriveError(err instanceof Error ? err.message : "Error al listar archivos de Drive");
    } finally {
      setLoadingDriveFiles(false);
    }
  }

  function toggleSeleccionado(fileId: string) {
    setSeleccionados((prev) => {
      const next = new Set(prev);
      if (next.has(fileId)) next.delete(fileId);
      else next.add(fileId);
      return next;
    });
  }

  function handleBorrarTodo() {
    setDocuments([]);
    setDriveFiles([]);
    setSeleccionados(new Set());
  }

  // Reemplaza la descarga local de JSON: solo manda las llaves de
  // extracted_data que el expediente realmente puede guardar
  // (PLD_CAMPOS_CONFIRMABLES, espejo de
  // PldContraparteKycViewSet.CAMPOS_CONFIRMABLES) - el resto (ej.
  // "nombre_completo", "clave_elector") no tiene columna propia en este
  // modelo y se descarta aqui mismo, antes de llamar al backend.
  async function handleConfirmarExtraccion(index: number) {
    const doc = documents[index];
    if (!doc.result) return;
    if (!contexto && !kycSeleccionado) return;

    const camposConfirmables = contexto ? contexto.camposConfirmables : PLD_CAMPOS_CONFIRMABLES;
    const campos = Object.fromEntries(
      Object.entries(doc.result.extracted_data).filter(
        ([key, value]) => value !== null && (camposConfirmables as readonly string[]).includes(key)
      )
    );
    if (Object.keys(campos).length === 0) {
      setDocuments((prev) =>
        prev.map((d, i) =>
          i === index
            ? { ...d, extraccionError: "Ningún dato extraído coincide con campos guardables de este registro." }
            : d
        )
      );
      return;
    }

    try {
      if (contexto) {
        await contexto.onConfirmar(campos);
      } else {
        await confirmarExtraccionKyc(kycSeleccionado, campos, actorUserId);
      }
      setDocuments((prev) =>
        prev.map((d, i) =>
          i === index ? { ...d, extraccionConfirmadaEn: new Date().toISOString(), extraccionError: undefined } : d
        )
      );
      onDatosActualizados?.();
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

  // "loading" solo cubre el encolado inicial (rapido, 202 por archivo) - una
  // vez encolados, cada archivo hace su propio polling independiente
  // (estadoAnalisis por indice) sin bloquear a los demas ni al boton de
  // enviar. Antes (sincrono) un archivo lento tumbaba a todos con el
  // timeout del gateway - ver docint/views.py::AnalyzeView.
  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const elegidos = driveFiles.filter((a) => seleccionados.has(a.file_id));
    if (elegidos.length === 0) return;
    setLoading(true);
    try {
      const iniciales: DocumentResult[] = elegidos.map((archivo) => ({
        archivo,
        expectedDocumentType: contexto?.expectedDocumentType ?? guessDocumentTypeFromFilename(archivo.nombre),
      }));
      setDocuments(iniciales);

      await Promise.all(
        iniciales.map(async (doc, index) => {
          try {
            const { analysisId, status } = await analyzeDocument({
              driveFileId: doc.archivo.file_id,
              carpeta,
              permKey,
              nombreArchivo: doc.archivo.nombre,
              mimeType: doc.archivo.mime_type ?? undefined,
              expectedDocumentType: doc.expectedDocumentType,
              servicioSolicitante: contexto?.servicioSolicitante ?? servicioSolicitante ?? "desconocido",
            });
            setDocuments((prev) =>
              prev.map((d, i) => (i === index ? { ...d, analysisId, estadoAnalisis: status, error: undefined } : d))
            );

            const final = await pollAnalysis(analysisId);
            setDocuments((prev) =>
              prev.map((d, i) =>
                i === index
                  ? {
                      ...d,
                      estadoAnalisis: final.status,
                      result: final.result ?? undefined,
                      error: final.error ?? undefined,
                    }
                  : d
              )
            );
          } catch (err) {
            setDocuments((prev) =>
              prev.map((d, i) =>
                i === index
                  ? { ...d, estadoAnalisis: "ERROR", error: err instanceof Error ? err.message : "Error desconocido" }
                  : d
              )
            );
          }
        })
      );
    } finally {
      setLoading(false);
    }
  }

  const hasResults = documents.some((doc) => doc.result || doc.error || doc.estadoAnalisis);

  // Cerrar el dialogo (X, Escape o clic afuera) NO debe perder lo ya
  // extraido - volver a analizar cuesta tokens de la IA. Por eso "cerrar" y
  // "borrar" son acciones distintas: cerrar solo oculta el dialogo (el
  // estado sigue vivo en este componente, sin desmontarse, mientras el
  // padre no cambie `open`); "Borrar todo" es la unica accion que limpia
  // el estado de verdad.
  function handleClose(_event?: unknown, reason?: "backdropClick" | "escapeKeyDown") {
    if (reason === "backdropClick" || reason === "escapeKeyDown") return;
    onClose();
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
          Análisis de documentos con IA — los archivos viven en Google Drive
          (el analista los sube ahí directamente); aquí solo se eligen y se
          analizan.
        </Typography>

        <Stack component="form" spacing={2} onSubmit={handleSubmit}>
          {contexto && (
            <Alert severity="info" variant="outlined">
              Analizando documentos de <strong>{contexto.etiqueta}</strong>.
            </Alert>
          )}

          {kycPreseleccionado && !contexto && (
            <Alert severity="info" variant="outlined">
              Analizando documentos del expediente <strong>{kycPreseleccionado.id_contraparte}</strong>.
            </Alert>
          )}

          {!kycPreseleccionado && !contexto && (
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
          )}

          {!contexto && !kycPreseleccionado && servicioSolicitante !== "pld-service" ? (
            <Alert severity="info">
              Este servicio todavía no tiene una carpeta de Drive resuelta —
              por ahora solo "pld-service" puede listar/analizar documentos.
            </Alert>
          ) : (
            <>
              {!kycPreseleccionado && !contexto && (
                <FormControl size="small" fullWidth>
                  <InputLabel id="kyc-select-label">Expediente KYC</InputLabel>
                  <Select
                    labelId="kyc-select-label"
                    label="Expediente KYC"
                    value={kycSeleccionado}
                    onChange={(e) => setKycSeleccionado(e.target.value)}
                  >
                    {kycOptions.map((kyc) => (
                      <MenuItem key={kyc.id_kyc} value={kyc.id_kyc}>
                        {kyc.id_contraparte} ({kyc.id_kyc})
                      </MenuItem>
                    ))}
                  </Select>
                  <Typography variant="caption" color="text.secondary" sx={{ mt: 0.5, px: 0.5 }}>
                    Determina la carpeta de Drive a listar (CumbresBI/PLD/&lt;contraparte&gt;/).
                  </Typography>
                </FormControl>
              )}

              <Button
                variant="outlined"
                startIcon={
                  loadingDriveFiles ? <CircularProgress size={18} /> : <FolderSearch size={18} strokeWidth={1.5} />
                }
                disabled={!destinoListo || loadingDriveFiles}
                onClick={handleVerArchivosDrive}
                sx={{ justifyContent: "flex-start" }}
              >
                Ver archivos en Drive
              </Button>

              {driveError && <Alert severity="error">{driveError}</Alert>}

              {driveFiles.length > 0 && (
                <List dense sx={{ bgcolor: "background.default", borderRadius: 1 }}>
                  {driveFiles.map((archivo) => (
                    <ListItem key={archivo.file_id} disablePadding>
                      <ListItemButton onClick={() => toggleSeleccionado(archivo.file_id)} dense>
                        <ListItemIcon sx={{ minWidth: 36 }}>
                          <Checkbox
                            edge="start"
                            checked={seleccionados.has(archivo.file_id)}
                            tabIndex={-1}
                            disableRipple
                            size="small"
                          />
                        </ListItemIcon>
                        <ListItemText
                          primary={archivo.nombre}
                          secondary={
                            DOCUMENT_TYPE_LABELS[guessDocumentTypeFromFilename(archivo.nombre)] ??
                            guessDocumentTypeFromFilename(archivo.nombre)
                          }
                        />
                      </ListItemButton>
                    </ListItem>
                  ))}
                </List>
              )}

              {driveFiles.length === 0 && !loadingDriveFiles && destinoListo && (
                <Typography variant="caption" color="text.secondary">
                  Sin archivos listados todavía — clic en "Ver archivos en
                  Drive" (o la carpeta está vacía).
                </Typography>
              )}

              <Button type="submit" variant="contained" disabled={loading || seleccionados.size === 0}>
                {loading ? (
                  <CircularProgress size={20} color="inherit" />
                ) : (
                  `Analizar ${seleccionados.size > 1 ? `${seleccionados.size} documentos` : "documento"}`
                )}
              </Button>
            </>
          )}
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
              <Accordion key={`${doc.archivo.file_id}-${index}`} defaultExpanded={documents.length === 1}>
                <AccordionSummary expandIcon={<ChevronDown size={18} strokeWidth={1.5} />}>
                  <Stack direction="row" spacing={1} alignItems="center" sx={{ flex: 1, minWidth: 0 }}>
                    <Typography variant="body2" noWrap sx={{ flex: 1 }}>
                      {doc.archivo.nombre}
                    </Typography>
                    {!doc.result && !doc.error && (doc.estadoAnalisis === "PENDIENTE" || doc.estadoAnalisis === "PROCESANDO") && (
                      <Chip
                        size="small"
                        icon={<CircularProgress size={12} color="inherit" />}
                        label="Procesando"
                        sx={{ "& .MuiChip-icon": { ml: 1 } }}
                      />
                    )}
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
                  {!doc.result && !doc.error && (doc.estadoAnalisis === "PENDIENTE" || doc.estadoAnalisis === "PROCESANDO") && (
                    <Typography variant="body2" color="text.secondary">
                      Analizando documento con IA, puede tardar unos segundos…
                    </Typography>
                  )}
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

                      {doc.extraccionConfirmadaEn ? (
                        <Alert severity="success">
                          Datos confirmados en el expediente el{" "}
                          {new Date(doc.extraccionConfirmadaEn).toLocaleString("es-MX")}.
                        </Alert>
                      ) : (
                        <Stack spacing={1}>
                          {doc.extraccionError && <Alert severity="error">{doc.extraccionError}</Alert>}
                          <Button
                            size="small"
                            variant="contained"
                            startIcon={<CheckCircle2 size={16} strokeWidth={1.5} />}
                            disabled={!destinoListo}
                            onClick={() => handleConfirmarExtraccion(index)}
                            sx={{ alignSelf: "flex-start" }}
                          >
                            Confirmar y guardar en el expediente
                          </Button>
                        </Stack>
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
