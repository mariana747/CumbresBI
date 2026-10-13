/** Convierte un array de objetos a CSV y dispara la descarga en el navegador. */
export function descargarCsv(filas: Record<string, string | number | null | undefined>[], nombreArchivo: string) {
  if (filas.length === 0) return;
  const encabezados = Object.keys(filas[0]);
  const escapar = (v: string | number | null | undefined) => {
    const s = v == null ? "" : String(v);
    return s.includes(",") || s.includes('"') || s.includes("\n") ? `"${s.replace(/"/g, '""')}"` : s;
  };
  const lineas = [
    encabezados.join(","),
    ...filas.map((f) => encabezados.map((k) => escapar(f[k])).join(",")),
  ];
  const blob = new Blob([lineas.join("\n")], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = nombreArchivo;
  link.click();
  URL.revokeObjectURL(url);
}
