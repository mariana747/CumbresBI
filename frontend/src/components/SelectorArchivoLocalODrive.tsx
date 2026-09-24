"use client";

import { Alert, Button, IconButton, Stack, Typography } from "@mui/material";
import { FileText, HardDrive, Upload, X as CloseIcon } from "lucide-react";
import { useState } from "react";
import { elegirArchivoDrive } from "@/lib/googleDriveFilePicker";

// Limite real del backend (24/Sep/2026, hallazgo real: subir un PDF de
// mas de 2.5MB tronaba con "RequestDataTooBig" - DATA_UPLOAD_MAX_MEMORY_SIZE
// se subio a 12MB en pld-service/tesoreria-service, ver sus settings.py).
// 10MB de margen para el archivo en si, dejando ~2MB de overhead del
// propio multipart (boundaries, otros campos del form).
const MAX_MB = 10;

// Selector de archivo: equipo O Drive (14/Sep/2026, "usa lo mismo que en
// Conciliación Bancaria, reutilizalo") - extraido de /tesoreria/conciliacion
// (importar extracto) para reusarlo tal cual en cualquier subida de archivo
// que quiera dar la misma opcion (ver solicitudes-pago/page.tsx). El
// "Subir"/confirmar sigue siendo responsabilidad de quien lo usa - este
// componente solo entrega el `File` elegido via onChange.
export default function SelectorArchivoLocalODrive({
  archivo,
  onChange,
  accept,
  mimeTypesDrive,
  tituloDrive,
}: {
  archivo: File | null;
  onChange: (archivo: File | null) => void;
  accept: string;
  mimeTypesDrive: string;
  tituloDrive: string;
}) {
  const [errorPickerDrive, setErrorPickerDrive] = useState<string | null>(null);

  function elegirLocal(archivoElegido: File | null) {
    setErrorPickerDrive(null);
    if (archivoElegido && archivoElegido.size > MAX_MB * 1024 * 1024) {
      setErrorPickerDrive(`El archivo pesa más de ${MAX_MB} MB - elige uno más pequeño.`);
      return;
    }
    onChange(archivoElegido);
  }

  async function handleElegirDesdeDrive() {
    setErrorPickerDrive(null);
    try {
      const elegido = await elegirArchivoDrive(mimeTypesDrive, tituloDrive);
      if (elegido) elegirLocal(elegido);
    } catch (err) {
      setErrorPickerDrive(err instanceof Error ? err.message : "No se pudo elegir el archivo de Drive.");
    }
  }

  return (
    <>
      <Stack direction="row" spacing={1}>
        <Button component="label" variant="outlined" startIcon={<Upload size={16} strokeWidth={1.5} />} sx={{ flex: 1 }}>
          Seleccionar archivo
          <input type="file" hidden accept={accept} onChange={(e) => elegirLocal(e.target.files?.[0] || null)} />
        </Button>
        <Button
          variant="outlined"
          startIcon={<HardDrive size={16} strokeWidth={1.5} />}
          onClick={handleElegirDesdeDrive}
          sx={{ flex: 1, whiteSpace: "nowrap" }}
        >
          Desde Drive
        </Button>
      </Stack>
      <Typography variant="caption" color="text.secondary" sx={{ mt: 0.5, display: "block" }}>
        Máximo {MAX_MB} MB por archivo.
      </Typography>
      {errorPickerDrive && (
        <Alert severity="error" sx={{ mt: 1 }} onClose={() => setErrorPickerDrive(null)}>
          {errorPickerDrive}
        </Alert>
      )}
      {/* Archivo cargado (14/Sep/2026, "debe mostrar el archivo cargado
      como en las paginas publicas") - fila propia, igual sin importar si
      vino del equipo o de Drive. */}
      {archivo && (
        <Stack
          direction="row"
          alignItems="center"
          spacing={1}
          sx={{ mt: 1.5, p: 1, border: "1px solid", borderColor: "divider", borderRadius: 1 }}
        >
          <FileText size={18} strokeWidth={1.5} />
          <Typography variant="body2" sx={{ flexGrow: 1, wordBreak: "break-word" }}>
            {archivo.name}
          </Typography>
          <IconButton size="small" aria-label="Quitar archivo" onClick={() => onChange(null)}>
            <CloseIcon size={16} strokeWidth={1.5} />
          </IconButton>
        </Stack>
      )}
    </>
  );
}
