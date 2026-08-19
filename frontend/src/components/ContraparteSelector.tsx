"use client";

import { useEffect, useState } from "react";
import { Autocomplete, CircularProgress, TextField } from "@mui/material";
import { TesoreriaContraparte, createContraparte, listContrapartes } from "@/lib/tesoreria";

const OPCION_NUEVA_ID = "__nueva__";

// Selector reusable de la contraparte maestra (19/Ago/2026, "un solo lugar
// para dar de alta clientes y proveedores" - ver docs/architecture/README.md
// sec. 11.2 #7). Busca contra el catalogo real de tesoreria-service
// (?search=) y, si no existe, permite crear una nueva ahi mismo con solo el
// nombre (alta minima, migracion 0002 de tesoreria-service) - el modulo que
// use este componente (PLD hoy, Ventas/Compras despues) YA NO genera su
// propio id_contraparte, adopta el real desde el primer momento.
export default function ContraparteSelector({
  value,
  onChange,
  label = "Contraparte",
  disabled,
}: {
  value: TesoreriaContraparte | null;
  onChange: (contraparte: TesoreriaContraparte | null) => void;
  label?: string;
  disabled?: boolean;
}) {
  const [inputValue, setInputValue] = useState(value?.razon_social ?? "");
  const [opciones, setOpciones] = useState<TesoreriaContraparte[]>([]);
  const [buscando, setBuscando] = useState(false);
  const [creando, setCreando] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!inputValue.trim() || inputValue === value?.razon_social) {
      setOpciones([]);
      return;
    }
    setBuscando(true);
    const timeout = setTimeout(() => {
      listContrapartes(inputValue)
        .then(setOpciones)
        .catch(() => setOpciones([]))
        .finally(() => setBuscando(false));
    }, 300);
    return () => clearTimeout(timeout);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [inputValue]);

  const hayCoincidenciaExacta = opciones.some(
    (o) => o.razon_social.trim().toLowerCase() === inputValue.trim().toLowerCase()
  );

  const opcionesConCrear =
    inputValue.trim() && !hayCoincidenciaExacta
      ? [
          ...opciones,
          {
            id_contraparte: OPCION_NUEVA_ID,
            razon_social: inputValue.trim(),
          } as TesoreriaContraparte,
        ]
      : opciones;

  async function handleChange(seleccion: TesoreriaContraparte | null) {
    setError(null);
    if (!seleccion) {
      onChange(null);
      return;
    }
    if (seleccion.id_contraparte !== OPCION_NUEVA_ID) {
      onChange(seleccion);
      return;
    }
    // "Crear nueva contraparte" - alta minima real en tesoreria-service,
    // solo el nombre (el resto se completa despues, mismo criterio que ya
    // usaba PLD por su cuenta antes de esta pantalla).
    setCreando(true);
    try {
      const nueva = await createContraparte({ razonSocial: seleccion.razon_social });
      onChange(nueva);
      setInputValue(nueva.razon_social);
    } catch (err) {
      setError(err instanceof Error ? err.message : "No se pudo crear la contraparte.");
    } finally {
      setCreando(false);
    }
  }

  return (
    <Autocomplete
      openOnFocus
      size="small"
      fullWidth
      disabled={disabled || creando}
      loading={buscando || creando}
      value={value}
      inputValue={inputValue}
      onInputChange={(_, nuevoValor) => setInputValue(nuevoValor)}
      onChange={(_, seleccion) => handleChange(seleccion)}
      options={opcionesConCrear}
      getOptionLabel={(o) =>
        o.id_contraparte === OPCION_NUEVA_ID ? o.razon_social : `${o.razon_social}${o.rfc ? ` (${o.rfc})` : ""}`
      }
      isOptionEqualToValue={(a, b) => a.id_contraparte === b.id_contraparte}
      renderOption={(props, option) => (
        <li {...props} key={option.id_contraparte}>
          {option.id_contraparte === OPCION_NUEVA_ID
            ? `+ Crear nueva contraparte: "${option.razon_social}"`
            : `${option.razon_social}${option.rfc ? ` — ${option.rfc}` : ""}`}
        </li>
      )}
      renderInput={(params) => (
        <TextField
          {...params}
          label={label}
          error={!!error}
          helperText={error || "Busca por nombre o RFC. Si no existe, créala aquí mismo."}
          InputProps={{
            ...params.InputProps,
            endAdornment: (
              <>
                {(buscando || creando) && <CircularProgress size={16} />}
                {params.InputProps.endAdornment}
              </>
            ),
          }}
        />
      )}
    />
  );
}
