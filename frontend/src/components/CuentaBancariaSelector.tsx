"use client";

import { useEffect, useState } from "react";
import { Autocomplete, CircularProgress, TextField } from "@mui/material";
import { TesoreriaCuenta, listCuentas } from "@/lib/tesoreria";

// Selector reusable de Cuenta bancaria (23/Sep/2026, mismo hallazgo que
// Contrapartes: el catalogo crece con cada empresa/proyecto nuevo y varias
// pantallas cargaban solo pageSize=200 sin buscador - ver
// ContraparteSelector.tsx, mismo criterio). Busca en vivo contra el
// catalogo real de tesoreria-service (?search=, lista completa visible al
// abrir el campo, sin esperar a que se escriba algo).
export default function CuentaBancariaSelector({
  value,
  onChange,
  label = "Cuenta bancaria",
  disabled,
  sociedad,
}: {
  value: TesoreriaCuenta | null;
  onChange: (cuenta: TesoreriaCuenta | null) => void;
  label?: string;
  disabled?: boolean;
  // Filtra a las cuentas de una sola empresa (opcional) - mismo patron que
  // ContraparteSelector.tipo.
  sociedad?: string;
}) {
  const [inputValue, setInputValue] = useState(value ? etiqueta(value) : "");
  const [opciones, setOpciones] = useState<TesoreriaCuenta[]>([]);
  const [buscando, setBuscando] = useState(false);

  useEffect(() => {
    setBuscando(true);
    const timeout = setTimeout(() => {
      listCuentas(inputValue || undefined, undefined, 200, sociedad)
        .then((res) => setOpciones(res.results))
        .catch(() => setOpciones([]))
        .finally(() => setBuscando(false));
    }, 300);
    return () => clearTimeout(timeout);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [inputValue, sociedad]);

  return (
    <Autocomplete
      openOnFocus
      size="small"
      fullWidth
      disabled={disabled}
      loading={buscando}
      value={value}
      inputValue={inputValue}
      onInputChange={(_, nuevoValor) => setInputValue(nuevoValor)}
      onChange={(_, seleccion) => {
        onChange(seleccion);
        setInputValue(seleccion ? etiqueta(seleccion) : "");
      }}
      options={opciones}
      getOptionLabel={etiqueta}
      isOptionEqualToValue={(a, b) => a.id_cuenta_bancaria === b.id_cuenta_bancaria}
      renderOption={(props, option) => (
        <li {...props} key={option.id_cuenta_bancaria}>
          {etiqueta(option)}
        </li>
      )}
      renderInput={(params) => (
        <TextField
          {...params}
          label={label}
          InputProps={{
            ...params.InputProps,
            endAdornment: (
              <>
                {buscando && <CircularProgress size={16} />}
                {params.InputProps.endAdornment}
              </>
            ),
          }}
        />
      )}
    />
  );
}

// "{alias} — {numero de cuenta}" (23/Sep/2026, mismo criterio que
// opcionCuenta() en tesoreria/saldos/page.tsx) - cae al id si no hay alias
// ni numero capturado.
function etiqueta(c: TesoreriaCuenta): string {
  const numero = c.cuenta || c.clabe;
  const nombre = c.alias || c.id_cuenta_bancaria;
  return numero ? `${nombre} — ${numero}` : nombre;
}
