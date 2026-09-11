"use client";

import { useEffect, useMemo, useState } from "react";
import { Autocomplete, Box, Button, Chip, CircularProgress, Collapse, Divider, Drawer, IconButton, Stack, TextField, Typography } from "@mui/material";
import { ChevronDown, ChevronRight, Eye, Maximize2, Minimize2, X as CloseIcon } from "lucide-react";
import {
  TesoreriaNomina,
  getContraparte,
  getContrato,
  getNomina,
  listFlujos,
  TesoreriaContraparte,
  TesoreriaContrato,
  TesoreriaFlujo,
} from "@/lib/tesoreria";
import { RrhhEmpleado, listEmpleados } from "@/lib/rrhh";

function numero(valor: string | null | undefined): string {
  if (valor === null || valor === undefined) return "—";
  return Number(valor).toLocaleString("es-MX", { style: "currency", currency: "MXN" });
}

export type ReferenciaCruzada =
  | { tipo: "contrato"; id: string }
  | { tipo: "proveedor"; id: string }
  // nomina (10/Sep/2026, "Ver Flujos debe seguir el patron de referencias
  // cruzadas") - mismo Drawer, en vez de navegar a /tesoreria/flujos.
  | { tipo: "nomina"; id: string }
  | null;

// Panel de referencias cruzadas (10/Sep/2026, "replica el patron en
// Facturas y Flujos") - extraido de Conciliacion de Facturas para
// reusarse tal cual en cualquier pantalla que muestre un id de
// contrato/proveedor y quiera un boton "Ver X" junto al dato. Ver receta
// completa en memoria de sesion "feedback-patron-referencias-cruzadas":
// Drawer (no modal ni redireccion) con z-index por encima de cualquier
// Dialog abierto detras, boton de pantalla completa, Flujos asociados
// expandibles con el detalle interno completo, sin bordes redondeados.
export default function PanelReferenciaCruzada({
  referencia,
  onClose,
}: {
  referencia: ReferenciaCruzada;
  onClose: () => void;
}) {
  const [datosContrato, setDatosContrato] = useState<TesoreriaContrato | null>(null);
  const [datosProveedor, setDatosProveedor] = useState<TesoreriaContraparte | null>(null);
  const [datosNomina, setDatosNomina] = useState<TesoreriaNomina | null>(null);
  const [cargando, setCargando] = useState(false);
  const [pantallaCompleta, setPantallaCompleta] = useState(false);
  const [flujos, setFlujos] = useState<TesoreriaFlujo[]>([]);
  const [cargandoFlujos, setCargandoFlujos] = useState(false);
  const [flujoExpandido, setFlujoExpandido] = useState<string | null>(null);
  // Filtro por Empleado (11/Sep/2026, pendiente de negocio) - solo aplica
  // dentro de "Ver Flujos" de una Nomina, unico caso donde los flujos
  // listados representan pagos a distintos empleados.
  const [empleados, setEmpleados] = useState<RrhhEmpleado[]>([]);
  const [filtroEmpleado, setFiltroEmpleado] = useState<string | null>(null);

  useEffect(() => {
    if (!referencia) return;
    setPantallaCompleta(false);
    setFlujoExpandido(null);
    setDatosContrato(null);
    setDatosProveedor(null);
    setDatosNomina(null);
    setFiltroEmpleado(null);
    setCargando(true);
    setCargandoFlujos(true);
    if (referencia.tipo === "contrato") {
      getContrato(referencia.id)
        .then(setDatosContrato)
        .catch(() => setDatosContrato(null))
        .finally(() => setCargando(false));
      listFlujos({ contrato: referencia.id })
        .then(setFlujos)
        .catch(() => setFlujos([]))
        .finally(() => setCargandoFlujos(false));
    } else if (referencia.tipo === "proveedor") {
      getContraparte(referencia.id)
        .then(setDatosProveedor)
        .catch(() => setDatosProveedor(null))
        .finally(() => setCargando(false));
      listFlujos({ contraparte: referencia.id })
        .then(setFlujos)
        .catch(() => setFlujos([]))
        .finally(() => setCargandoFlujos(false));
    } else {
      getNomina(referencia.id)
        .then(setDatosNomina)
        .catch(() => setDatosNomina(null))
        .finally(() => setCargando(false));
      listFlujos({ nomina: referencia.id })
        .then(setFlujos)
        .catch(() => setFlujos([]))
        .finally(() => setCargandoFlujos(false));
      listEmpleados().then(setEmpleados).catch(() => setEmpleados([]));
    }
  }, [referencia]);

  // Re-filtra al elegir empleado, sin re-pedir datos del contrato/proveedor
  // (solo aplica cuando referencia.tipo === "nomina").
  useEffect(() => {
    if (!referencia || referencia.tipo !== "nomina") return;
    setCargandoFlujos(true);
    listFlujos({ nomina: referencia.id, id_empleado: filtroEmpleado || undefined })
      .then(setFlujos)
      .catch(() => setFlujos([]))
      .finally(() => setCargandoFlujos(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filtroEmpleado]);

  const nombreEmpleado = useMemo(() => {
    const mapa = new Map(empleados.map((e) => [e.id_empleado, e.nombre_completo]));
    return (idEmpleado: string | null) => (idEmpleado ? mapa.get(idEmpleado) || idEmpleado : "—");
  }, [empleados]);

  return (
    <Drawer
      anchor="right"
      open={!!referencia}
      onClose={(_, reason) => {
        // Solo se cierra con el boton X (10/Sep/2026, "las pantallas
        // flotantes deben tener esto de solo cerrar con la x") - ignora
        // backdropClick/escapeKeyDown, mismo criterio que el Dialog de
        // "Pago" en Conciliacion de Facturas.
        if (reason === "backdropClick" || reason === "escapeKeyDown") return;
        onClose();
      }}
      sx={{ zIndex: (theme) => theme.zIndex.modal + 1 }}
    >
      <Box sx={{ width: pantallaCompleta ? "100vw" : 380, p: 3, transition: "width 0.15s" }}>
        <Stack direction="row" alignItems="center" justifyContent="space-between" sx={{ mb: 2 }}>
          <Typography variant="h6">
            {referencia?.tipo === "contrato" ? "Contrato" : referencia?.tipo === "proveedor" ? "Proveedor" : "Nómina"}
          </Typography>
          <Stack direction="row" spacing={0.5}>
            <IconButton
              size="small"
              aria-label={pantallaCompleta ? "Quitar pantalla completa" : "Pantalla completa"}
              title={pantallaCompleta ? "Quitar pantalla completa" : "Pantalla completa"}
              onClick={() => setPantallaCompleta((v) => !v)}
            >
              {pantallaCompleta ? <Minimize2 size={16} strokeWidth={1.5} /> : <Maximize2 size={16} strokeWidth={1.5} />}
            </IconButton>
            <IconButton size="small" aria-label="Cerrar" onClick={onClose}>
              <CloseIcon size={18} strokeWidth={1.5} />
            </IconButton>
          </Stack>
        </Stack>
        <Divider sx={{ mb: 2 }} />

        {cargando ? (
          <CircularProgress size={16} />
        ) : referencia?.tipo === "contrato" && datosContrato ? (
          <Stack spacing={1.5}>
            <Typography variant="body2">
              <strong>ID:</strong> {datosContrato.id_contrato}
            </Typography>
            <Typography variant="body2">
              <strong>Contraparte:</strong> {datosContrato.contraparte_nombre}
            </Typography>
            <Typography variant="body2">
              <strong>Sociedad:</strong> {datosContrato.sociedad}
            </Typography>
            <Typography variant="body2">
              <strong>Tipo:</strong> {datosContrato.tipo || "—"}
            </Typography>
            <Typography variant="body2">
              <strong>Categoría:</strong> {datosContrato.categoria || "—"}
            </Typography>
            <Typography variant="body2">
              <strong>Requiere factura:</strong> {datosContrato.requiere_factura ? "Sí" : "No"}
            </Typography>
            <Typography variant="body2">
              <strong>Estatus:</strong> {datosContrato.status || "—"}
            </Typography>
            <Typography variant="body2">
              <strong>Vigencia:</strong> {datosContrato.fecha_generacion || "—"} a {datosContrato.fecha_vencimiento || "—"}
            </Typography>
            {datosContrato.link_contrato && (
              <Button
                size="small"
                startIcon={<Eye size={14} strokeWidth={1.5} />}
                component="a"
                href={datosContrato.link_contrato}
                target="_blank"
                rel="noopener noreferrer"
              >
                Ver contrato firmado
              </Button>
            )}
          </Stack>
        ) : referencia?.tipo === "proveedor" && datosProveedor ? (
          <Stack spacing={1.5}>
            <Typography variant="body2">
              <strong>ID:</strong> {datosProveedor.id_contraparte}
            </Typography>
            <Typography variant="body2">
              <strong>Razón social:</strong> {datosProveedor.razon_social}
            </Typography>
            <Typography variant="body2">
              <strong>RFC:</strong> {datosProveedor.rfc || "—"}
            </Typography>
            <Typography variant="body2">
              <strong>Contacto:</strong> {datosProveedor.contacto || "—"}
            </Typography>
            <Typography variant="body2">
              <strong>Correo:</strong> {datosProveedor.email || "—"}
            </Typography>
            <Typography variant="body2">
              <strong>Teléfono:</strong> {datosProveedor.telefono_sms || "—"}
            </Typography>
          </Stack>
        ) : referencia?.tipo === "nomina" && datosNomina ? (
          <Stack spacing={1.5}>
            <Typography variant="body2">
              <strong>ID:</strong> {datosNomina.id_nomina}
            </Typography>
            <Typography variant="body2">
              <strong>Tipo:</strong> {datosNomina.tipo === "QUINCENAL" ? "Quincenal (corporativo)" : "Semanal (obra)"}
            </Typography>
            <Typography variant="body2">
              <strong>Empresa:</strong> {datosNomina.sociedad}
            </Typography>
            <Typography variant="body2">
              <strong>Proyecto:</strong> {datosNomina.proyecto || "—"}
            </Typography>
            <Typography variant="body2">
              <strong>Serie:</strong> {datosNomina.serie}
            </Typography>
            <Typography variant="body2">
              <strong>Periodo:</strong> {datosNomina.fecha_inicio || "—"} a {datosNomina.fecha_fin || "—"}
            </Typography>
            <Typography variant="body2">
              <strong>Status:</strong> {datosNomina.status === "ACTIVO" ? "Activa" : "Cerrada"}
            </Typography>
          </Stack>
        ) : (
          <Typography variant="body2" color="text.secondary">
            No se encontró el registro.
          </Typography>
        )}

        {/* Flujos asociados - cada fila se expande con el detalle completo
        del Flujo, no solo lo minimo. */}
        {referencia && (
          <Box sx={{ mt: 3 }}>
            <Typography variant="subtitle2" sx={{ mb: 1 }}>
              Flujos asociados {flujos.length > 0 && `(${flujos.length})`}
            </Typography>
            {referencia.tipo === "nomina" && (
              <Autocomplete
                size="small"
                options={empleados}
                getOptionLabel={(e) => e.nombre_completo}
                value={empleados.find((e) => e.id_empleado === filtroEmpleado) || null}
                onChange={(_, value) => setFiltroEmpleado(value?.id_empleado || null)}
                renderInput={(params) => <TextField {...params} label="Filtrar por empleado" />}
                sx={{ mb: 1.5 }}
              />
            )}
            {cargandoFlujos ? (
              <CircularProgress size={16} />
            ) : flujos.length === 0 ? (
              <Typography variant="body2" color="text.secondary">
                Sin flujos asociados.
              </Typography>
            ) : (
              <Stack spacing={0.5}>
                {flujos.map((f) => {
                  const expandido = flujoExpandido === f.id_flujo;
                  return (
                    <Box key={f.id_flujo} sx={{ border: 1, borderColor: "divider", borderRadius: 0 }}>
                      <Stack
                        direction="row"
                        spacing={1}
                        alignItems="center"
                        sx={{ p: 1, cursor: "pointer" }}
                        onClick={() => setFlujoExpandido(expandido ? null : f.id_flujo)}
                      >
                        {expandido ? <ChevronDown size={14} strokeWidth={1.5} /> : <ChevronRight size={14} strokeWidth={1.5} />}
                        <Box sx={{ flex: 1 }}>
                          <Typography variant="body2" sx={{ fontFamily: "var(--font-mono, monospace)" }}>
                            {f.id_flujo}
                          </Typography>
                          <Typography variant="caption" color="text.secondary">
                            {f.concepto || "—"} — {numero(f.total_mxp)}
                          </Typography>
                        </Box>
                        <Chip
                          size="small"
                          label={f.pagado ? "Pagado" : "Sin pagar"}
                          color={f.pagado ? "success" : "default"}
                          variant="outlined"
                          sx={{ borderRadius: 0.5 }}
                        />
                      </Stack>
                      <Collapse in={expandido}>
                        <Stack spacing={0.75} sx={{ px: 1.5, pb: 1.5 }}>
                          <Typography variant="caption">
                            <strong>Cuenta:</strong> {f.cuenta_alias || f.cuenta}
                          </Typography>
                          {referencia.tipo === "nomina" && (
                            <Typography variant="caption">
                              <strong>Empleado:</strong> {nombreEmpleado(f.id_empleado)}
                            </Typography>
                          )}
                          <Typography variant="caption">
                            <strong>Categoría de gasto:</strong> {f.categoria_gasto || "—"}
                          </Typography>
                          <Typography variant="caption">
                            <strong>Fecha efectiva:</strong> {f.fecha_efectiva || "—"}
                          </Typography>
                          <Typography variant="caption">
                            <strong>Fecha de pago:</strong> {f.fecha_pago || "—"}
                          </Typography>
                          <Typography variant="caption">
                            <strong>Autorización:</strong> {f.autorizacion ? "Sí" : "No"} {f.autorizado_por ? `(${f.autorizado_por})` : ""}
                          </Typography>
                          <Typography variant="caption">
                            <strong>Estado de validación:</strong> {f.validacion_estado || "—"}
                          </Typography>
                          <Typography variant="caption">
                            <strong>Estado CFDI:</strong> {f.estado_cfdi || "—"}
                          </Typography>
                          <Typography variant="caption">
                            <strong>Reembolso:</strong> {f.reembolso ? "Sí" : "No"}
                          </Typography>
                          <Typography variant="caption">
                            <strong>Comentarios:</strong> {f.comentarios || "—"}
                          </Typography>
                          <Typography variant="caption" color="text.secondary">
                            Creado {f.created_at?.slice(0, 10)} por {f.created_by || "—"} · Actualizado{" "}
                            {f.updated_at?.slice(0, 10)} por {f.updated_by || "—"}
                          </Typography>
                        </Stack>
                      </Collapse>
                    </Box>
                  );
                })}
              </Stack>
            )}
          </Box>
        )}
      </Box>
    </Drawer>
  );
}
