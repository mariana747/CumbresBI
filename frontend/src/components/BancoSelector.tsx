"use client";

import { useEffect, useState } from "react";
import { Autocomplete, CircularProgress, TextField } from "@mui/material";
import { TesoreriaBanco, listBancos } from "@/lib/tesoreria";

// Selector reusable de Banco (23/Sep/2026, mismo criterio que
// ContraparteSelector/CuentaBancariaSelector) - busca en vivo contra el
// catalogo real de tesoreria-service. Riesgo de bug bajo hoy (~90 bancos,
// catalogo Banxico estable) pero se convierte por consistencia con el
// resto de selectores de catalogo.
export default function BancoSelector({
  value,
  onChange,
  label = "Banco",
  disabled,
}: {
  value: TesoreriaBanco | null;
  onChange: (banco: TesoreriaBanco | null) => void;
  label?: string;
  disabled?: boolean;
}) {
  const [inputValue, setInputValue] = useState(value ? etiqueta(value) : "");
  const [opciones, setOpciones] = useState<TesoreriaBanco[]>([]);
  const [buscando, setBuscando] = useState(false);

  useEffect(() => {
    setBuscando(true);
    const timeout = setTimeout(() => {
      listBancos(inputValue || undefined, undefined, 200)
        .then((res) => setOpciones(res.results))
        .catch(() => setOpciones([]))
        .finally(() => setBuscando(false));
    }, 300);
    return () => clearTimeout(timeout);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [inputValue]);

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
      isOptionEqualToValue={(a, b) => a.id_banxico === b.id_banxico}
      renderOption={(props, option) => (
        <li {...props} key={option.id_banxico}>
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

function etiqueta(b: TesoreriaBanco): string {
  return b.alias ? `${b.banco || b.id_banxico} (${b.alias})` : b.banco || b.id_banxico;
}
