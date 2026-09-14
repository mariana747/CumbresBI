// Prueba de la edición manual antes de confirmar (30/Ago/2026, pendiente
// "UI de revisión de contraparte en conciliación IA" - ver memoria de sesión
// tesoreria-flujos-registro-y-conciliacion-ia-plan). Cubre solo las dos
// funciones puras que arman/filtran el formulario editable
// (camposEditadosDesdeExtraccion / camposParaConfirmar) - a propósito NO
// prueba el análisis real (docint/analyze -> Gemini), eso necesita Google
// real y no se puede simular aquí.
import { describe, expect, it } from "vitest";
import { camposEditadosDesdeExtraccion, camposParaConfirmar } from "./MotorDocumentalDialog";

describe("camposEditadosDesdeExtraccion", () => {
  it("se queda solo con los campos que el destino puede guardar, como texto", () => {
    const extracted = {
      fecha_efectiva: "2026-08-30",
      total_mxp: 1250.5,
      concepto: "Pago de renta",
      contraparte_nombre: "Proveedor S.A. de C.V.",
      clave_elector: "ABC123", // no es un campo confirmable de Flujos
    };
    const camposConfirmables = ["fecha_efectiva", "total_mxp", "concepto", "contraparte_nombre"] as const;

    const resultado = camposEditadosDesdeExtraccion(extracted, camposConfirmables);

    expect(resultado).toEqual({
      fecha_efectiva: "2026-08-30",
      total_mxp: "1250.5",
      concepto: "Pago de renta",
      contraparte_nombre: "Proveedor S.A. de C.V.",
    });
    expect(resultado).not.toHaveProperty("clave_elector");
  });

  it("descarta los campos que la IA no pudo extraer (null)", () => {
    const extracted = { fecha_efectiva: "2026-08-30", concepto: null };
    const resultado = camposEditadosDesdeExtraccion(extracted, ["fecha_efectiva", "concepto"]);

    expect(resultado).toEqual({ fecha_efectiva: "2026-08-30" });
  });

  it("sin campos confirmables (ej. contexto mal configurado) regresa vacío", () => {
    const extracted = { fecha_efectiva: "2026-08-30" };
    expect(camposEditadosDesdeExtraccion(extracted, [])).toEqual({});
  });
});

describe("camposParaConfirmar", () => {
  it("manda tal cual lo que el analista dejó (incluye correcciones a mano)", () => {
    const camposEditados = {
      contraparte_nombre: "Proveedor Correcto S.A.", // la IA leyó mal el nombre, el analista lo corrigió
      total_mxp: "1250.5",
    };
    expect(camposParaConfirmar(camposEditados)).toEqual(camposEditados);
  });

  it("descarta un campo que el analista borró a propósito, en vez de mandarlo vacío", () => {
    const camposEditados = { contraparte_nombre: "", total_mxp: "1250.5" };
    expect(camposParaConfirmar(camposEditados)).toEqual({ total_mxp: "1250.5" });
  });

  it("un valor de solo espacios también se descarta (no es un dato real)", () => {
    expect(camposParaConfirmar({ concepto: "   " })).toEqual({});
  });

  it("si el analista borró todo, regresa vacío (la pantalla debe avisar, no mandar nada)", () => {
    expect(camposParaConfirmar({ concepto: "", fecha_efectiva: "" })).toEqual({});
  });
});
