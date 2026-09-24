"use client";

import { useEffect, useState } from "react";
import { Autocomplete, CircularProgress, TextField } from "@mui/material";
import { TesoreriaContrato, listContratos } from "@/lib/tesoreria";

// Selector reusable de Contrato (23/Sep/2026, mismo hallazgo que
// Contrapartes/Cuentas: 937 contratos reales, varias pantallas cargaban
// solo pageSize=200 sin buscador - ver ContraparteSelector.tsx, mismo
// criterio). Busca en vivo contra el catalogo real de tesoreria-service.
export default function ContratoSelector({
  value,
  onChange,
  label = "Contrato",
  disabled,
  sociedad,
}: {
  value: TesoreriaContrato | null;
  onChange: (contrato: TesoreriaContrato | null) => void;
  label?: string;
  disabled?: boolean;
  // Filtra a los contratos de una sola empresa (opcional) - mismo patron
  // que CuentaBancariaSelector.sociedad.
  sociedad?: string;
}) {
  const [inputValue, setInputValue] = useState(value ? etiqueta(value) : "");
  const [opciones, setOpciones] = useState<TesoreriaContrato[]>([]);
  const [buscando, setBuscando] = useState(false);

  useEffect(() => {
    setBuscando(true);
    const timeout = setTimeout(() => {
      listContratos(inputValue || undefined, undefined, 1, 200, sociedad)
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
      isOptionEqualToValue={(a, b) => a.id_contrato === b.id_contrato}
      renderOption={(props, option) => (
        <li {...props} key={option.id_contrato}>
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

function etiqueta(c: TesoreriaContrato): string {
  return c.contraparte_nombre ? `${c.id_contrato} — ${c.contraparte_nombre}` : c.id_contrato;
}
