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

describe("buildNavItems - placeholders 'en desarrollo' (clickeables, no deshabilitados)", () => {
  const CASOS: { prefijos: string[]; href: string }[] = [
    { prefijos: ["ventas-vivienda", "materiales"], href: "/ventas-vivienda" },
    { prefijos: ["contrapartes", "tesoreria", "facturacion-cfdi"], href: "/tesoreria/contrapartes" },
    { prefijos: ["compras"], href: "/compras-tesoreria" },
    { prefijos: ["rrhh"], href: "/rrhh" },
  ];

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

// Hallazgo de esta ronda (11/Ago/2026, ver docs/CumbresBI_estado.md): hay
// dos servicios de la matriz sin ningun apartado dueno en el sidebar -
// "tickets" (TICKETS_RESPONSABLE, TICKETS_PARTICIPANTE, EMPLEADO_SELF) y
// "rentas" (FINANZAS_MANAGER, CONTRALOR) - ya resuelto (11/Ago/2026,
// pantallas "en desarrollo" agregadas, ver /tickets y /rentas). Este test
// se queda como red de seguridad: si algun dia se agrega un servicio
// nuevo a la matriz sin apartado dueno, vuelve a quedar en rojo (no se
// oculta con .skip, el rojo es el aviso).
describe("buildNavItems - servicios sin apartado dueno (hallazgo, en rojo a proposito)", () => {
  const DUEÑO_CONOCIDO: Record<string, string> = {
    iam: "/admin/usuarios (o Auditar)",
    "pld-compliance": "/pld",
    contrapartes: "/tesoreria/contrapartes",
    "ventas-vivienda": "/ventas-vivienda",
    materiales: "/ventas-vivienda",
    tesoreria: "/tesoreria/contrapartes",
    "facturacion-cfdi": "/tesoreria/contrapartes",
    compras: "/compras-tesoreria",
    rrhh: "/rrhh",
    tickets: "/tickets",
    rentas: "/rentas",
    audit: "Bitácora (dentro de Admin(IAM)/Auditar, no un item propio)",
  };

  it("todo servicio de la matriz tiene un apartado dueno en el sidebar", () => {
    const sinDueno: string[] = [];
    for (const servicio of matrizFixture.servicios) {
      if (DUEÑO_CONOCIDO[servicio]) continue;

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
    expect(buscar(items, "/ventas-vivienda"), "debe sumar Ventas de VENTAS_ASESOR").toBeDefined();
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
    expect(buscar(items, "/ventas-vivienda"), "no debe perder Ventas por tener IAM_ADMIN tambien").toBeDefined();
  });
});
