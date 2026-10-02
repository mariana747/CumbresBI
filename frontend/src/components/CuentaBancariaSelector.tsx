"use client";

import { useEffect, useState } from "react";
import { Autocomplete, CircularProgress, TextField } from "@mui/material";
import { TesoreriaCuenta, listCuentas } from "@/lib/tesoreria";
import { GeneralSociedad, listSociedades } from "@/lib/iam";

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
  const [inputValue, setInputValue] = useState("");
  const [opciones, setOpciones] = useState<TesoreriaCuenta[]>([]);
  const [buscando, setBuscando] = useState(false);
  const [sociedades, setSociedades] = useState<GeneralSociedad[]>([]);

  useEffect(() => {
    listSociedades().then(setSociedades).catch(() => setSociedades([]));
  }, []);

  useEffect(() => {
    if (value) setInputValue(etiqueta(value, sociedades));
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sociedades]);

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
        setInputValue(seleccion ? etiqueta(seleccion, sociedades) : "");
      }}
      options={opciones}
      getOptionLabel={(c) => etiqueta(c, sociedades)}
      isOptionEqualToValue={(a, b) => a.id_cuenta_bancaria === b.id_cuenta_bancaria}
      renderOption={(props, option) => (
        <li {...props} key={option.id_cuenta_bancaria}>
          {etiqueta(option, sociedades)}
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

// Mismo formato que aliasCuenta() en tesoreria/cuentas/page.tsx:
// "Sociedad/Banco/últimos4/Tipo"
function etiqueta(c: TesoreriaCuenta, sociedades: GeneralSociedad[]): string {
  const soc = sociedades.find((s) => s.rfc === c.sociedad);
  const numero = c.cuenta || c.clabe;
  const partes = [
    soc?.alias_sociedad || soc?.razon_social,
    c.banco_alias || c.banco_nombre,
    numero ? numero.slice(-4) : null,
    c.tipo,
  ].filter(Boolean);
  if (partes.length) return partes.join("/");
  return c.label || c.alias || c.id_cuenta_bancaria;
}
