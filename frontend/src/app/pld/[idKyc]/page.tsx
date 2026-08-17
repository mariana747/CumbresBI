"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import {
  Alert,
  Avatar,
  Box,
  Button,
  Chip,
  CircularProgress,
  Grid,
  Paper,
  Stack,
  Tab,
  Tabs,
  Typography,
} from "@mui/material";
import {
  ArrowLeft,
  ChevronLeft,
  ChevronRight,
  CheckCircle2,
  FileText,
  Flag,
  ShieldQuestion,
  Snowflake,
  UploadCloud,
} from "lucide-react";
import AppShell from "@/components/AppShell";
import MotorDocumentalDialog from "@/components/MotorDocumentalDialog";
import { BRAND } from "@/theme/theme";
import { SessionUser, getSession } from "@/lib/auth";
import {
  PldContraparteKyc,
  PldDatosEditables,
  aprobarKyc,
  congelarKyc,
  getKyc,
  marcarSospechosoKyc,
  reactivarCuentaKyc,
} from "@/lib/pld";

// Tipos que el Motor Documental ya reconoce (docint/classifier.py) - solo
// referencia informativa, la deteccion es automatica por nombre de archivo.
const SUPPORTED_DOCUMENT_TYPES = [
  "INE / IFE",
  "CURP",
  "Comprobante de domicilio",
  "Constancia de situación fiscal",
  "Acta de nacimiento",
  "Acta constitutiva",
];

const ESTADO_CUENTA_LABELS: Record<string, string> = {
  ACTIVA: "Activa",
  SOSPECHOSA: "Marcada como sospechosa",
  CONGELADA: "Congelada",
};

const ESTADO_CUENTA_COLOR: Record<string, "success" | "warning" | "error"> = {
  ACTIVA: "success",
  SOSPECHOSA: "warning",
  CONGELADA: "error",
};

// Vista de detalle de un expediente KYC (17/Ago/2026, referencia visual
// pedida por Mariana: dossier tipo "KYC/AML Customer Dossier" con pestañas
// y semáforo de riesgo) - adaptado a nuestra paleta clara (BRAND) en vez
// del mockup oscuro original, y a los datos que REALMENTE existen hoy.
// "Análisis de riesgo" e "Historial de transacciones" quedan como
// "próximamente": requieren integración externa de KYC/AML (PEP/OFAC) y el
// módulo de Tesorería respectivamente, ninguno construido todavía (ver
// memoria de sesión "pld-validacion-externa-kyc-pendiente").

const CAMPOS_GENERAL: { campo: keyof PldDatosEditables; label: string }[] = [
  { campo: "curp", label: "CURP" },
  { campo: "nacionalidad", label: "Nacionalidad" },
  { campo: "pais_nac_const", label: "País de nacimiento / constitución" },
  { campo: "fecha_nac_const", label: "Fecha de nacimiento / constitución" },
  { campo: "estado_civil", label: "Estado civil" },
  { campo: "ocupacion_act_economica", label: "Ocupación / actividad económica" },
  { campo: "telefono_fijo", label: "Teléfono fijo" },
  { campo: "telefono_sms", label: "Teléfono para SMS" },
  { campo: "dom_calle", label: "Calle" },
  { campo: "dom_numero_ext", label: "Número exterior" },
  { campo: "dom_colonia", label: "Colonia" },
  { campo: "dom_municipio_alcaldia", label: "Municipio / alcaldía" },
  { campo: "dom_estado", label: "Estado" },
  { campo: "dom_cp", label: "Código postal" },
  { campo: "dom_pais", label: "País" },
];

export default function PldExpedienteDetallePage() {
  const params = useParams<{ idKyc: string }>();
  const router = useRouter();
  const [session, setSession] = useState<SessionUser | null>(null);
  const [kyc, setKyc] = useState<(PldContraparteKyc & PldDatosEditables) | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [tab, setTab] = useState(0);
  const [aprobando, setAprobando] = useState(false);
  const [cambiandoEstadoCuenta, setCambiandoEstadoCuenta] = useState(false);
  const [motorAbierto, setMotorAbierto] = useState(false);

  function cargar() {
    setLoading(true);
    getKyc(params.idKyc)
      .then(setKyc)
      .catch((err) => setError(err instanceof Error ? err.message : "Error al cargar el expediente"))
      .finally(() => setLoading(false));
  }

  useEffect(() => {
    cargar();
    getSession().then(setSession);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [params.idKyc]);

  const puedeAprobar = session?.perm_keys.includes("pld-compliance.aprobar") ?? false;
  const puedeCrear = session?.perm_keys.includes("pld-compliance.crear") ?? false;

  async function handleAprobar() {
    if (!session?.user_id) return;
    setAprobando(true);
    try {
      await aprobarKyc(params.idKyc, session.user_id);
      cargar();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error al aprobar el expediente");
    } finally {
      setAprobando(false);
    }
  }

  async function handleCambiarEstadoCuenta(accion: "marcar_sospechoso" | "congelar" | "reactivar_cuenta") {
    setCambiandoEstadoCuenta(true);
    try {
      const accionFn = { marcar_sospechoso: marcarSospechosoKyc, congelar: congelarKyc, reactivar_cuenta: reactivarCuentaKyc }[
        accion
      ];
      await accionFn(params.idKyc);
      cargar();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error al actualizar el estado de la cuenta");
    } finally {
      setCambiandoEstadoCuenta(false);
    }
  }

  return (
    <AppShell>
      <Button
        size="small"
        startIcon={<ArrowLeft size={16} strokeWidth={1.5} />}
        onClick={() => router.push("/pld")}
        sx={{ mb: 2 }}
      >
        Volver a expedientes
      </Button>

      {loading && (
        <Stack alignItems="center" sx={{ py: 6 }}>
          <CircularProgress size={28} />
        </Stack>
      )}

      {error && <Alert severity="error">{error}</Alert>}

      {kyc && (
        <Grid container spacing={3}>
          {/* Columna izquierda: identidad + acciones */}
          <Grid item xs={12} md={3}>
            <Paper variant="outlined" sx={{ p: 3, textAlign: "center" }}>
              <Avatar sx={{ width: 64, height: 64, mx: "auto", mb: 1.5, bgcolor: BRAND.azul, fontSize: 22 }}>
                {kyc.id_contraparte.slice(0, 2).toUpperCase()}
              </Avatar>
              <Typography variant="subtitle1" fontWeight={600}>
                Contraparte {kyc.id_contraparte}
              </Typography>
              <Typography variant="caption" color="text.secondary">
                {kyc.curp ? `CURP: ${kyc.curp}` : "Sin CURP capturado todavía"}
              </Typography>
              <Box sx={{ mt: 1.5, mb: 2.5 }}>
                <Chip
                  size="small"
                  label={ESTADO_CUENTA_LABELS[kyc.estado_cuenta] ?? kyc.estado_cuenta}
                  color={ESTADO_CUENTA_COLOR[kyc.estado_cuenta] ?? "default"}
                />
              </Box>

              {/* Estadisticas (visual, mismo estilo del mockup) - Risk
              Score/PEP Status son "No disponible" a proposito, sin
              proveedor externo conectado todavia. Estado de cuenta si es
              real (mismo valor que el chip de arriba). */}
              <Stack spacing={1.5} divider={<Box sx={{ borderTop: "1px solid", borderColor: "divider" }} />} sx={{ textAlign: "left" }}>
                <Box>
                  <Typography variant="caption" color="text.secondary" display="block">
                    NIVEL DE RIESGO
                  </Typography>
                  <Typography variant="body2" fontWeight={600} color="text.disabled">
                    No disponible
                  </Typography>
                </Box>
                <Box>
                  <Typography variant="caption" color="text.secondary" display="block">
                    ESTATUS PEP
                  </Typography>
                  <Typography variant="body2" fontWeight={600} color="text.disabled">
                    No disponible
                  </Typography>
                </Box>
                <Box>
                  <Typography variant="caption" color="text.secondary" display="block">
                    ESTADO DE CUENTA
                  </Typography>
                  <Typography variant="body2" fontWeight={600}>
                    {ESTADO_CUENTA_LABELS[kyc.estado_cuenta] ?? kyc.estado_cuenta}
                  </Typography>
                </Box>
              </Stack>
            </Paper>
          </Grid>

          {/* Columna derecha: pestañas */}
          <Grid item xs={12} md={9}>
            <Paper variant="outlined">
              <Tabs value={tab} onChange={(_, v) => setTab(v)} sx={{ borderBottom: "1px solid", borderColor: "divider", px: 2 }}>
                <Tab label="Información general" />
                <Tab label="Análisis de riesgo" />
                <Tab label="Documentos KYC" />
                <Tab label="Historial de transacciones" />
              </Tabs>

              <Box sx={{ p: 3 }}>
                {tab === 0 && (
                  <Grid container spacing={2}>
                    {CAMPOS_GENERAL.map(({ campo, label }) => (
                      <Grid item xs={12} sm={6} key={campo}>
                        <Typography variant="body2" color="text.secondary" display="block">
                          {label}
                        </Typography>
                        <Typography variant="body1">{kyc[campo] || "—"}</Typography>
                      </Grid>
                    ))}
                  </Grid>
                )}

                {tab === 1 && (
                  <Alert severity="info" icon={<ShieldQuestion size={20} strokeWidth={1.5} />}>
                    Próximamente — requiere conectar un proveedor externo de KYC/AML (listas PEP/OFAC,
                    validación INE/RENAPO, RFC/SAT). Todavía no hay ninguno elegido.
                  </Alert>
                )}

                {tab === 2 && (
                  <Stack spacing={2}>
                    <Stack direction={{ xs: "column", sm: "row" }} spacing={2} justifyContent="space-between">
                      <Stack direction="row" flexWrap="wrap" useFlexGap gap={1}>
                        {SUPPORTED_DOCUMENT_TYPES.map((label) => (
                          <Chip key={label} label={label} size="small" variant="outlined" />
                        ))}
                      </Stack>
                      {puedeCrear && (
                        <Button
                          size="small"
                          variant="contained"
                          startIcon={<UploadCloud size={16} strokeWidth={1.5} />}
                          onClick={() => setMotorAbierto(true)}
                          sx={{ whiteSpace: "nowrap" }}
                        >
                          Analizar con Motor Documental
                        </Button>
                      )}
                    </Stack>

                    {kyc.documentos.length === 0 ? (
                      <Typography variant="body2" color="text.secondary">
                        Sin documentos subidos todavía.
                      </Typography>
                    ) : (
                      kyc.documentos.map((doc) => (
                        <Paper key={doc.id_kyc_doc} variant="outlined" sx={{ p: 1.5 }}>
                          <Stack direction="row" spacing={1.5} alignItems="center" justifyContent="space-between">
                            <Stack direction="row" spacing={1.5} alignItems="center">
                              <FileText size={18} strokeWidth={1.5} color={BRAND.azul} />
                              <Typography variant="body2">{doc.denominacion || "Documento sin nombre"}</Typography>
                            </Stack>
                            <Chip size="small" label={doc.status ?? "Sin estado"} />
                          </Stack>
                        </Paper>
                      ))
                    )}
                  </Stack>
                )}

                {tab === 3 && (
                  <Alert severity="info" icon={<ShieldQuestion size={20} strokeWidth={1.5} />}>
                    Próximamente — depende del módulo de Tesorería, que todavía no existe.
                  </Alert>
                )}
              </Box>
            </Paper>
          </Grid>

          {/* Control puramente visual (17/Ago/2026, pedido de Mariana: "que
          no haga nada las partes faltantes") - ajustar calificacion de
          riesgo requiere el motor de scoring EBR, que no existe todavia
          (ver docs/CumbresBI_V2_Plan_de_Trabajo_y_Cronograma.md Fase 2
          Semana 10 y memoria "pld-validacion-externa-kyc-pendiente").
          Deshabilitado a proposito, no decorativo-enganoso: el cursor
          "not-allowed" y el texto atenuado dejan claro que no responde. */}
          <Grid item xs={12}>
            <Paper
              variant="outlined"
              sx={{ p: 1.5, display: "flex", alignItems: "center", gap: 2, opacity: 0.6, cursor: "not-allowed" }}
            >
              <Typography variant="body2" fontWeight={600} sx={{ whiteSpace: "nowrap" }}>
                Ajustar calificación de riesgo
              </Typography>
              <Button size="small" disabled sx={{ minWidth: 0, px: 1 }}>
                <ChevronLeft size={18} strokeWidth={1.5} />
              </Button>
              <Box
                sx={{
                  flex: 1,
                  textAlign: "center",
                  py: 1,
                  bgcolor: "background.default",
                  borderRadius: 1,
                }}
              >
                <Typography variant="body2" fontWeight={600} color="text.disabled">
                  No disponible — requiere motor de scoring EBR
                </Typography>
              </Box>
              <Button size="small" disabled sx={{ minWidth: 0, px: 1 }}>
                <ChevronRight size={18} strokeWidth={1.5} />
              </Button>
            </Paper>
          </Grid>

          {/* Acciones reales, ancho completo abajo (pedido de Mariana
          17/Ago/2026: no en la columna izquierda). */}
          {puedeAprobar && (
            <Grid item xs={12}>
              <Stack direction={{ xs: "column", sm: "row" }} spacing={1.5}>
                {!kyc.aprobado_en && (
                  <Button
                    fullWidth
                    variant="contained"
                    color="success"
                    startIcon={<CheckCircle2 size={18} strokeWidth={1.5} />}
                    disabled={aprobando || cambiandoEstadoCuenta}
                    onClick={handleAprobar}
                  >
                    {aprobando ? <CircularProgress size={20} color="inherit" /> : "Aprobar expediente"}
                  </Button>
                )}

                {kyc.estado_cuenta !== "SOSPECHOSA" && (
                  <Button
                    fullWidth
                    variant="outlined"
                    color="warning"
                    startIcon={<Flag size={18} strokeWidth={1.5} />}
                    disabled={aprobando || cambiandoEstadoCuenta}
                    onClick={() => handleCambiarEstadoCuenta("marcar_sospechoso")}
                  >
                    Marcar como sospechoso
                  </Button>
                )}

                {kyc.estado_cuenta === "CONGELADA" ? (
                  <Button
                    fullWidth
                    variant="outlined"
                    disabled={aprobando || cambiandoEstadoCuenta}
                    onClick={() => handleCambiarEstadoCuenta("reactivar_cuenta")}
                  >
                    Reactivar cuenta
                  </Button>
                ) : (
                  <Button
                    fullWidth
                    variant="outlined"
                    color="error"
                    startIcon={<Snowflake size={18} strokeWidth={1.5} />}
                    disabled={aprobando || cambiandoEstadoCuenta}
                    onClick={() => handleCambiarEstadoCuenta("congelar")}
                  >
                    Congelar cuenta
                  </Button>
                )}
              </Stack>
            </Grid>
          )}
        </Grid>
      )}

      {kyc && (
        <MotorDocumentalDialog
          open={motorAbierto}
          onClose={() => setMotorAbierto(false)}
          kycPreseleccionado={{ id_kyc: kyc.id_kyc, id_contraparte: kyc.id_contraparte }}
          onDatosActualizados={cargar}
        />
      )}
    </AppShell>
  );
}
