"use client";

import { useEffect, useState } from "react";
import { Autocomplete, CircularProgress, TextField } from "@mui/material";
import { TesoreriaContraparte, createContraparte, generarIdCorto, listContrapartes } from "@/lib/tesoreria";

const OPCION_NUEVA_ID = "__nueva__";

// Selector reusable de la contraparte maestra (19/Ago/2026, "un solo lugar
// para dar de alta clientes y proveedores" - ver docs/architecture/README.md
// sec. 11.2 #7). Busca contra el catalogo real de tesoreria-service
// (?search=, con la lista completa ya visible al abrir el campo - sin
// esperar a que se escriba algo) y, si no existe, permite crear una nueva
// ahi mismo con solo el nombre (alta minima, migracion 0002 de
// tesoreria-service) - el modulo que use este componente (PLD hoy, Ventas
// tambien) YA NO genera su propio id_contraparte, adopta el real desde el
// primer momento.
export default function ContraparteSelector({
  value,
  onChange,
  label = "Contraparte",
  disabled,
  // Filtra la lista a solo clientes o solo proveedores (ej. PLD
  // preguntando "es un cliente o un proveedor?" antes de buscar) y marca
  // esa misma bandera al crear una contraparte nueva desde aqui. Sin
  // filtro, muestra/crea sin marcar ninguna de las dos.
  tipo,
}: {
  value: TesoreriaContraparte | null;
  onChange: (contraparte: TesoreriaContraparte | null) => void;
  label?: string;
  disabled?: boolean;
  tipo?: "cliente" | "proveedor";
}) {
  const [inputValue, setInputValue] = useState(value?.razon_social ?? "");
  const [opciones, setOpciones] = useState<TesoreriaContraparte[]>([]);
  const [buscando, setBuscando] = useState(false);
  const [creando, setCreando] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    // Sin gate por texto vacio (19/Ago/2026, hallazgo: antes solo buscaba
    // si ya habias escrito algo) - abrir el campo debe mostrar de una vez
    // el catalogo existente (o el subconjunto de clientes/proveedores,
    // segun "tipo"), no obligar a escribir primero para descubrir que ya
    // hay opciones.
    setBuscando(true);
    const timeout = setTimeout(() => {
      listContrapartes(inputValue || undefined, tipo)
        .then(setOpciones)
        .catch(() => setOpciones([]))
        .finally(() => setBuscando(false));
    }, 300);
    return () => clearTimeout(timeout);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [inputValue, tipo]);

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
    // usaba PLD por su cuenta antes de esta pantalla). Se marca
    // cliente/proveedor segun "tipo" para que quede clasificada de una vez.
    setCreando(true);
    try {
      const nueva = await createContraparte({
        idContraparte: generarIdCorto(),
        razonSocial: seleccion.razon_social,
        cliente: tipo === "cliente",
        proveedor: tipo === "proveedor",
      });
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
          helperText={error || "Escribe para buscar, o elige de la lista. Si no existe, créala aquí mismo."}
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
