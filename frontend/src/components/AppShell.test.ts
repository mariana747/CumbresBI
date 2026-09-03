// Primera prueba automatizada del proyecto (11/Ago/2026) - recorre los 17
// roles del catalogo (docs/architecture/roles-y-permisos.md sec. 2-3)
// contra la logica REAL de gating del sidebar (buildNavItems) y de
// lib/auth.ts, en vez de una lista fija de "que debe ver cada rol"
// (eso seria reinventar la matriz a mano otra vez, y se desalinearia con
// el codigo con el tiempo sin que nadie se diera cuenta). Se afirman las
// REGLAS ya implementadas; si el codigo se desvia de una regla, el test
// avisa. La matriz de permisos por rol (fixture JSON) se genera desde
// services/iam-service/iam/permission_matrix.py - unica fuente real, ver
// ese archivo si hace falta regenerar el fixture.
import { describe, expect, it } from "vitest";
import { buildNavItems, type NavItem } from "./AppShell";
import {
  puedeAdministrarIam,
  puedeVerBitacora,
  tieneAccesoIam,
  tieneAccesoPld,
  type SessionUser,
} from "@/lib/auth";
import matrizFixture from "./__tests__/fixtures/roleAccessMatrix.json";

const ROLES = matrizFixture.roles as Record<string, string[]>;

function sesionDe(roleKey: string, overrides: Partial<SessionUser> = {}): SessionUser {
  return {
    user_id: "test-user",
    email: "test@cypcumbres.mx",
    is_global: false,
    sociedad_rfcs: [],
    proyecto_ids: [],
    centro_ids: [],
    contrato_ids: [],
    role_keys: [roleKey],
    perm_keys: ROLES[roleKey],
    picture_url: null,
    ...overrides,
  };
}

function buscar(items: NavItem[], href: string): NavItem | undefined {
  return items.find((item) => item.href === href);
}

function hijos(item: NavItem | undefined): readonly { label: string; href: string }[] {
  return item && "children" in item ? item.children : [];
}

describe("buildNavItems - Admin (IAM)", () => {
  it("con iam.crear o iam.editar muestra el menu completo (Auditoria incluida, unifica Reportes+Bitacora)", () => {
    for (const roleKey of Object.keys(ROLES)) {
      const perms = ROLES[roleKey];
      if (!perms.includes("iam.crear") && !perms.includes("iam.editar")) continue;

      const items = buildNavItems(sesionDe(roleKey));
      const admin = buscar(items, "/admin/usuarios");
      expect(admin, `${roleKey} deberia tener el apartado Admin(IAM)`).toBeDefined();
      const labels = hijos(admin).map((c) => c.label);
      // "Reportes" y "Bitácora" se unificaron en una sola entrada
      // "Auditoría" (17/Ago/2026, hallazgo: apuntaban a la misma pantalla
      // /admin/reportes con distinta pestaña inicial).
      expect(labels, `${roleKey}: menu completo debe incluir Auditoría`).toContain("Auditoría");
    }
  });

  it("con solo iam.leer (sin escritura, sin ser AUDITOR) muestra Admin(IAM) de solo lectura", () => {
    for (const roleKey of Object.keys(ROLES)) {
      const perms = ROLES[roleKey];
      const soloLectura =
        perms.includes("iam.leer") &&
        !perms.includes("iam.crear") &&
        !perms.includes("iam.editar") &&
        roleKey !== "AUDITOR";
      if (!soloLectura) continue;

      const items = buildNavItems(sesionDe(roleKey));
      const admin = buscar(items, "/admin/usuarios");
      expect(admin, `${roleKey} deberia tener Admin(IAM) de solo lectura`).toBeDefined();
      const labels = hijos(admin).map((c) => c.label);
      expect(labels, `${roleKey}: version solo-lectura NO debe incluir Auditoría`).not.toContain(
        "Auditoría"
      );
    }
  });

  it("AUDITOR ve 'Auditar' en vez de Admin(IAM), aunque tenga iam.leer", () => {
    const items = buildNavItems(sesionDe("AUDITOR"));
    expect(buscar(items, "/admin/usuarios")).toBeUndefined();
    const auditar = items.find((i) => i.label === "Auditar");
    expect(auditar).toBeDefined();
    expect(hijos(auditar).map((c) => c.label)).toContain("Bitácora");
  });

  it("sin ningun perm_key de iam no aparece nada de Admin(IAM) ni Auditar", () => {
    const items = buildNavItems(sesionDe("TICKETS_PARTICIPANTE"));
    expect(buscar(items, "/admin/usuarios")).toBeUndefined();
    expect(items.find((i) => i.label === "Auditar")).toBeUndefined();
  });
});

describe("buildNavItems - PLD", () => {
  it("cualquier pld-compliance.* muestra el apartado PLD", () => {
    for (const roleKey of Object.keys(ROLES)) {
      if (!ROLES[roleKey].some((p) => p.startsWith("pld-compliance."))) continue;
      const items = buildNavItems(sesionDe(roleKey));
      expect(buscar(items, "/pld"), `${roleKey} deberia ver PLD`).toBeDefined();
    }
  });

  it("sin pld-compliance.* no aparece PLD", () => {
    const items = buildNavItems(sesionDe("VENTAS_ASESOR"));
    expect(buscar(items, "/pld")).toBeUndefined();
  });
});

// Primer modulo de negocio con pantallas reales ademas de Admin(IAM)/PLD
// (Fase 3, arranque de exposicion CRUD, 19/Ago/2026) - mismo estandar de
// apartados con children (URL propio por pantalla), no un placeholder "en
// desarrollo" mas. Sale del bloque de placeholders de abajo, igual que
// nunca estuvo ahi Admin(IAM)/PLD.
describe("buildNavItems - Ventas / Vivienda", () => {
  it("algun perm de ventas-vivienda muestra el apartado con sus 5 pantallas", () => {
    for (const roleKey of Object.keys(ROLES)) {
      const tieneAlguno = ROLES[roleKey].some((p) => p.startsWith("ventas-vivienda."));
      if (!tieneAlguno) continue;
      const items = buildNavItems(sesionDe(roleKey));
      const ventas = buscar(items, "/ventas-vivienda/proyectos");
      expect(ventas, `${roleKey} deberia ver Ventas / Vivienda`).toBeDefined();
      expect(ventas?.enabled).toBe(true);
      const labels = hijos(ventas).map((c) => c.label);
      expect(labels).toEqual(["Proyectos", "Viviendas", "Asesores", "Expedientes", "Presupuestos"]);
    }
  });

  it("sin ventas-vivienda.* no aparece el apartado", () => {
    const items = buildNavItems(sesionDe("RRHH_ADMIN"));
    expect(buscar(items, "/ventas-vivienda/proyectos")).toBeUndefined();
  });
});

// Materiales vive en Obra desde 21/Ago/2026 (pedido de Mariana: "materiales
// debe estar en obra") - antes colgaba de Ventas/Vivienda; ver AppShell.tsx.
describe("buildNavItems - Obra (incluye Materiales)", () => {
  it("algun perm de obra/materiales muestra el apartado con Materiales", () => {
    for (const roleKey of Object.keys(ROLES)) {
      const tieneAlguno = ROLES[roleKey].some(
        (p) => p.startsWith("obra.") || p.startsWith("materiales.")
      );
      if (!tieneAlguno) continue;
      const items = buildNavItems(sesionDe(roleKey));
      const obra = buscar(items, "/obra/avance");
      expect(obra, `${roleKey} deberia ver Obra`).toBeDefined();
      expect(obra?.enabled).toBe(true);
      const labels = hijos(obra).map((c) => c.label);
      expect(labels).toContain("Materiales");
      expect(labels).toContain("Requisiciones");
      const materiales = hijos(obra).find((c) => c.label === "Materiales");
      expect(materiales?.href).toBe("/obra/materiales");
      const requisiciones = hijos(obra).find((c) => c.label === "Requisiciones");
      expect(requisiciones?.href).toBe("/obra/requisiciones");
    }
  });

  it("sin obra.*/materiales.* no aparece el apartado", () => {
    const items = buildNavItems(sesionDe("RRHH_ADMIN"));
    expect(buscar(items, "/obra/avance")).toBeUndefined();
  });
});

// Tesoreria (18/Ago/2026, arranque formal de Fase 4) ya tiene pantalla real
// de Contrapartes/Cuentas/Contratos - mismo estandar de apartado con
// children que Ventas/Vivienda de arriba, ya no es un placeholder "en
// desarrollo". El permiso "contrapartes" tambien lo activa (varios roles de
// PLD solo tienen contrapartes.leer, ver AppShell.tsx).
describe("buildNavItems - Tesorería", () => {
  it("algun perm de contrapartes/tesoreria/facturacion-cfdi muestra el apartado con sus pantallas", () => {
    for (const roleKey of Object.keys(ROLES)) {
      const tieneAlguno = ROLES[roleKey].some(
        (p) =>
          p.startsWith("contrapartes.") || p.startsWith("tesoreria.") || p.startsWith("facturacion-cfdi.")
      );
      if (!tieneAlguno) continue;
      const items = buildNavItems(sesionDe(roleKey));
      const tesoreria = buscar(items, "/tesoreria/contrapartes");
      expect(tesoreria, `${roleKey} deberia ver Tesorería`).toBeDefined();
      expect(tesoreria?.enabled).toBe(true);
      const labels = hijos(tesoreria).map((c) => c.label);
      // Orden real de AppShell.tsx (31/Ago/2026): Contrapartes ahora va
      // primero, seguida de Contratos y Flujos (Contrato -> genera Flujos,
      // ver memoria "tesoreria-alcance-real"), el resto sigue igual desde
      // el 26/Ago/2026.
      expect(labels).toEqual([
        "Contrapartes",
        "Contratos",
        "Flujos",
        "Saldos",
        "Reporte diario",
        "Notas de crédito",
        "Cuentas bancarias",
        "Facturas",
        "Complementos de pago",
        "Recibos de nómina",
      ]);
    }
  });

  it("sin contrapartes.*/tesoreria.*/facturacion-cfdi.* no aparece el apartado", () => {
    const items = buildNavItems(sesionDe("RRHH_ADMIN"));
    expect(buscar(items, "/tesoreria/contrapartes")).toBeUndefined();
  });
});

describe("buildNavItems - placeholders 'en desarrollo' (clickeables, no deshabilitados)", () => {
  // "compras" se quito de esta lista (24/Ago/2026, pedido de Mariana) -
  // /compras-tesoreria ya no existe como item del sidebar en absoluto (no
  // es que siga deshabilitado, se elimino por completo: mismo dominio que
  // Tesoreria, que ya tiene pantallas reales - ver DUEÑO_CONOCIDO abajo).
  const CASOS: { prefijos: string[]; href: string }[] = [{ prefijos: ["rrhh"], href: "/rrhh" }];

  for (const { prefijos, href } of CASOS) {
    it(`algun perm de [${prefijos.join(", ")}] muestra ${href} habilitado`, () => {
      for (const roleKey of Object.keys(ROLES)) {
        const tieneAlguno = ROLES[roleKey].some((p) => prefijos.some((pre) => p.startsWith(`${pre}.`)));
        if (!tieneAlguno) continue;
        const items = buildNavItems(sesionDe(roleKey));
        const item = buscar(items, href);
        expect(item, `${roleKey} deberia ver ${href}`).toBeDefined();
        expect(item?.enabled, `${roleKey}: ${href} deberia estar habilitado (no gris)`).toBe(true);
      }
    });
  }
});

describe("buildNavItems - siempre presentes", () => {
  it("Panel y MiCumbres aparecen para cualquier rol", () => {
    for (const roleKey of Object.keys(ROLES)) {
      const items = buildNavItems(sesionDe(roleKey));
      expect(buscar(items, "/")).toBeDefined();
      expect(buscar(items, "/micumbres")).toBeDefined();
    }
  });
});

// Hallazgo de esta ronda (11/Ago/2026, ver docs/CumbresBI_estado.md): hubo
// dos servicios de la matriz sin ningun apartado dueno en el sidebar -
// "tickets" (TICKETS_RESPONSABLE, TICKETS_PARTICIPANTE, EMPLEADO_SELF) y
// "rentas" (FINANZAS_MANAGER, CONTRALOR). Se agregaron placeholders "en
// desarrollo" ese dia, pero se QUITARON otra vez el 19/Ago/2026 (pedido de
// Mariana - ningun backend real detras, quedaban como ruido en el sidebar).
// SIN_DUEÑO_A_PROPOSITO documenta ese hueco como deliberado (no un
// descuido) para no confundirlo con un servicio nuevo que de verdad se le
// olvido a alguien agregarle apartado - ver DUEÑO_CONOCIDO abajo para esos.
// Este test se queda como red de seguridad: si algun dia se agrega un
// servicio nuevo a la matriz sin apartado dueno NI en esta lista, vuelve a
// quedar en rojo (no se oculta con .skip, el rojo es el aviso).
describe("buildNavItems - servicios sin apartado dueno (hallazgo, en rojo a proposito)", () => {
  const DUEÑO_CONOCIDO: Record<string, string> = {
    iam: "/admin/usuarios (o Auditar)",
    "pld-compliance": "/pld",
    contrapartes: "/tesoreria/contrapartes",
    "ventas-vivienda": "/ventas-vivienda/proyectos",
    materiales: "/ventas-vivienda/proyectos",
    tesoreria: "/tesoreria/contrapartes",
    "facturacion-cfdi": "/tesoreria/contrapartes",
    // "compras" ya tiene apartado real (02/Sep/2026, Fase 4B) - ver
    // buildNavItems en AppShell.tsx.
    compras: "/compras/solicitudes",
    rrhh: "/rrhh",
    audit: "Bitácora (dentro de Admin(IAM)/Auditar, no un item propio)",
  };

  const SIN_DUEÑO_A_PROPOSITO = new Set(["tickets", "rentas"]);

  it("todo servicio de la matriz tiene un apartado dueno en el sidebar (o esta en SIN_DUEÑO_A_PROPOSITO)", () => {
    const sinDueno: string[] = [];
    for (const servicio of matrizFixture.servicios) {
      if (DUEÑO_CONOCIDO[servicio] || SIN_DUEÑO_A_PROPOSITO.has(servicio)) continue;

      // Sesion sintetica con SOLO el permiso de este servicio (no un rol
      // real completo) - a proposito, para aislar el hallazgo: un rol
      // real como FINANZAS_MANAGER (rentas + tesoreria/compras) o
      // SUPER_ADMIN (tickets + todo lo demas) enmascararia el hueco
      // porque ya muestra otro apartado por sus DEMAS permisos.
      const items = buildNavItems(
        sesionDe("SUPER_ADMIN", { role_keys: [], perm_keys: [`${servicio}.leer`] })
      );
      const soloPanelYMiCumbres = items.every((i) => i.href === "/" || i.href === "/micumbres");
      if (soloPanelYMiCumbres) sinDueno.push(servicio);
    }
    expect(
      sinDueno,
      `Servicios sin apartado dueno en el sidebar (construir la pantalla, mismo patron que ` +
        `Contrapartes/Ventas/Compras/RRHH/Tickets/Rentas, o agregarlo a DUEÑO_CONOCIDO si no le toca una)`
    ).toEqual([]);
  });
});

describe("lib/auth.ts helpers contra la matriz real", () => {
  it("puedeAdministrarIam solo es true para roles con iam.crear o iam.editar", () => {
    for (const roleKey of Object.keys(ROLES)) {
      const esperado = ROLES[roleKey].includes("iam.crear") || ROLES[roleKey].includes("iam.editar");
      expect(puedeAdministrarIam(sesionDe(roleKey)), roleKey).toBe(esperado);
    }
  });

  it("tieneAccesoIam es true para cualquier perm_key de iam (incluye solo-lectura)", () => {
    for (const roleKey of Object.keys(ROLES)) {
      const esperado = ROLES[roleKey].some((p) => p.startsWith("iam."));
      expect(tieneAccesoIam(sesionDe(roleKey)), roleKey).toBe(esperado);
    }
  });

  it("tieneAccesoPld es true solo si trae algun pld-compliance.*", () => {
    for (const roleKey of Object.keys(ROLES)) {
      const esperado = ROLES[roleKey].some((p) => p.startsWith("pld-compliance."));
      expect(tieneAccesoPld(sesionDe(roleKey)), roleKey).toBe(esperado);
    }
  });

  it("puedeVerBitacora es true con is_global=true o role AUDITOR, sin importar perm_keys", () => {
    expect(puedeVerBitacora(sesionDe("VENTAS_ASESOR", { is_global: true }))).toBe(true);
    expect(puedeVerBitacora(sesionDe("AUDITOR", { is_global: false }))).toBe(true);
    expect(puedeVerBitacora(sesionDe("VENTAS_ASESOR", { is_global: false }))).toBe(false);
  });
});

// Un usuario puede tener varios roles activos a la vez (roles-y-permisos.md
// sec. 4) - iam-service ya une los perm_keys de todos ellos en un solo
// array (scope_utils.compute_effective_scope_claims, un solo `set()` que
// solo agrega). Este test confirma que el lado del frontend (que nunca
// mira "cual es el rol", solo si un perm_key especifico esta en el
// array) es compatible con esa union por construccion: un usuario con
// PLD_ANALISTA (sin ventas-vivienda) + VENTAS_ASESOR (sin pld-compliance.
// aprobar) a la vez debe ver AMBOS apartados, nunca perder uno por tener
// el otro.
describe("Suma de permisos - varios roles activos en la misma sesion", () => {
  it("union de PLD_ANALISTA + VENTAS_ASESOR ve ambos apartados, ningun permiso se pierde", () => {
    const sesion = sesionDe("PLD_ANALISTA", {
      role_keys: ["PLD_ANALISTA", "VENTAS_ASESOR"],
      perm_keys: Array.from(new Set([...ROLES.PLD_ANALISTA, ...ROLES.VENTAS_ASESOR])),
    });

    const items = buildNavItems(sesion);
    expect(buscar(items, "/pld"), "debe conservar PLD de PLD_ANALISTA").toBeDefined();
    expect(buscar(items, "/ventas-vivienda/proyectos"), "debe sumar Ventas de VENTAS_ASESOR").toBeDefined();
    expect(buscar(items, "/tesoreria/contrapartes")).toBeDefined();

    // Ninguno de los dos roles trae iam.crear/editar por si solo - la
    // union tampoco debe inventarlo.
    expect(puedeAdministrarIam(sesion)).toBe(false);
    expect(buscar(items, "/admin/usuarios")).toBeDefined(); // solo lectura, por iam.leer
  });

  it("si CUALQUIERA de los roles trae escritura, la union completa gana (no se degrada a solo lectura)", () => {
    const sesion = sesionDe("VENTAS_ASESOR", {
      role_keys: ["VENTAS_ASESOR", "IAM_ADMIN"],
      perm_keys: Array.from(new Set([...ROLES.VENTAS_ASESOR, ...ROLES.IAM_ADMIN])),
    });

    expect(puedeAdministrarIam(sesion)).toBe(true);
    const items = buildNavItems(sesion);
    const admin = buscar(items, "/admin/usuarios");
    expect(hijos(admin).map((c) => c.label)).toContain("Auditoría");
    expect(buscar(items, "/ventas-vivienda/proyectos"), "no debe perder Ventas por tener IAM_ADMIN tambien").toBeDefined();
  });
});
