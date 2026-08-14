"use client";

import { Dialog, DialogContent, DialogTitle, Divider, Grid, IconButton, Stack, Typography } from "@mui/material";
import { X as CloseIcon } from "lucide-react";
import { PldContraparteKyc } from "@/lib/pld";

// Vista de detalle del expediente KYC (13/Ago/2026) - antes los datos que
// el Motor Documental guarda via confirmar_extraccion (CURP, domicilio,
// fecha de nacimiento, etc.) se guardaban bien en la base de datos pero no
// habia ninguna pantalla que los mostrara completos (la tabla de /pld solo
// tiene la columna CURP) - este dialogo de solo lectura cierra ese hueco.
function Campo({ label, valor }: { label: string; valor: string | null | undefined }) {
  return (
    <Grid item xs={12} sm={6}>
      <Typography variant="caption" color="text.secondary" display="block">
        {label}
      </Typography>
      <Typography variant="body2">{valor || "—"}</Typography>
    </Grid>
  );
}

export default function KycDetalleDialog({
  kyc,
  open,
  onClose,
}: {
  kyc: PldContraparteKyc | null;
  open: boolean;
  onClose: () => void;
}) {
  if (!kyc) return null;

  return (
    <Dialog open={open} onClose={onClose} fullWidth maxWidth="sm">
      <DialogTitle sx={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        Expediente KYC — {kyc.id_contraparte}
        <IconButton onClick={onClose} size="small" aria-label="Cerrar">
          <CloseIcon size={18} strokeWidth={1.5} />
        </IconButton>
      </DialogTitle>
      <DialogContent dividers>
        <Stack spacing={3}>
          <div>
            <Typography variant="subtitle2" gutterBottom>
              Identificación
            </Typography>
            <Grid container spacing={2}>
              <Campo label="CURP" valor={kyc.curp} />
              <Campo label="Nacionalidad" valor={kyc.nacionalidad} />
              <Campo label="Fecha de nacimiento / constitución" valor={kyc.fecha_nac_const} />
              <Campo label="País de nacimiento / constitución" valor={kyc.pais_nac_const} />
              <Campo label="Folio mercantil" valor={kyc.folio_mercantil} />
              <Campo label="Objeto social" valor={kyc.objeto_social} />
              <Campo label="Ocupación / actividad económica" valor={kyc.ocupacion_act_economica} />
              <Campo label="Tipo de identificación" valor={kyc.tipo_identificacion} />
              <Campo label="Autoridad emisora" valor={kyc.autoridad_identificacion} />
              <Campo label="Número de identificación" valor={kyc.numero_identificacion} />
              <Campo label="Estado civil" valor={kyc.estado_civil} />
              <Campo label="Fideicomiso" valor={kyc.ident_fideicomiso} />
            </Grid>
          </div>

          <Divider />

          <div>
            <Typography variant="subtitle2" gutterBottom>
              Domicilio
            </Typography>
            <Grid container spacing={2}>
              <Campo label="Calle" valor={kyc.dom_calle} />
              <Campo label="Número exterior" valor={kyc.dom_numero_ext} />
              <Campo label="Número interior" valor={kyc.dom_numero_int} />
              <Campo label="Colonia" valor={kyc.dom_colonia} />
              <Campo label="Municipio / alcaldía" valor={kyc.dom_municipio_alcaldia} />
              <Campo label="Estado" valor={kyc.dom_estado} />
              <Campo label="Código postal" valor={kyc.dom_cp} />
              <Campo label="País" valor={kyc.dom_pais} />
            </Grid>
          </div>

          <Divider />

          <div>
            <Typography variant="subtitle2" gutterBottom>
              Domicilio de correspondencia
            </Typography>
            <Grid container spacing={2}>
              <Campo label="Calle" valor={kyc.dom_corresp_dom_calle} />
              <Campo label="Número exterior" valor={kyc.dom_corresp_dom_numero_ext} />
              <Campo label="Número interior" valor={kyc.dom_corresp_dom_numero_int} />
              <Campo label="Colonia" valor={kyc.dom_corresp_dom_colonia} />
              <Campo label="Municipio / alcaldía" valor={kyc.dom_corresp_dom_municipio_alcaldia} />
              <Campo label="Estado" valor={kyc.dom_corresp_dom_estado} />
              <Campo label="Código postal" valor={kyc.dom_corresp_dom_cp} />
              <Campo label="País" valor={kyc.dom_corresp_dom_pais} />
            </Grid>
          </div>

          <Divider />

          <div>
            <Typography variant="subtitle2" gutterBottom>
              Contacto
            </Typography>
            <Grid container spacing={2}>
              <Campo label="Teléfono fijo" valor={kyc.telefono_fijo} />
              <Campo label="Teléfono / SMS" valor={kyc.telefono_sms} />
            </Grid>
          </div>

          <Divider />

          <div>
            <Typography variant="subtitle2" gutterBottom>
              Estado y auditoría
            </Typography>
            <Grid container spacing={2}>
              <Campo label="Estado de llenado" valor={kyc.estado_llenado} />
              <Campo label="Aprobado por" valor={kyc.aprobado_por} />
              <Campo label="Aprobado en" valor={kyc.aprobado_en ? new Date(kyc.aprobado_en).toLocaleString("es-MX") : null} />
              <Campo label="Vencimiento" valor={kyc.fecha_vencimiento} />
              <Campo label="Creado" valor={new Date(kyc.created_at).toLocaleString("es-MX")} />
              <Campo label="Creado por" valor={kyc.created_by} />
              <Campo label="Última actualización" valor={new Date(kyc.updated_at).toLocaleString("es-MX")} />
              <Campo label="Actualizado por" valor={kyc.updated_by} />
              <Campo label="Comentarios" valor={kyc.comentarios} />
            </Grid>
          </div>
        </Stack>
      </DialogContent>
    </Dialog>
  );
}
