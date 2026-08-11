"use client";

import { useState } from "react";
import { GATEWAY_URL } from "@/lib/gatewayUrl";

// TEMPORAL - borrar junto con iam-service/iam/dev_views.py y el bloque
// `if settings.DEBUG` de config/urls.py cuando termine la ronda de
// revision de roles (decision de producto 11/Ago/2026, ver plan de la
// sesion). Requiere haber hecho un login real de Google antes (el
// endpoint de abajo lee esa sesion, no crea una nueva) - despues, cada
// link cambia el rol activo al instante sin volver a pasar por Google.
//
// Soporta elegir VARIOS roles a la vez (checkboxes) - dev_views.py acepta
// "?role=A,B,C" y crea una IamUserRole por cada uno, para probar la union
// real de permisos de varios roles activos en la misma sesion
// (roles-y-permisos.md sec. 4: "los perm_keys se suman, nunca se
// quitan") - no solo un rol aislado por vez.
const IAM_API_BASE_URL = process.env.NEXT_PUBLIC_IAM_API_BASE_URL ?? `${GATEWAY_URL}/iam`;

// Mismos IDs de prueba usados a mano toda la sesion (no hay catalogo real
// de sociedad/proyecto/centro todavia).
const SOCIEDAD_PRUEBA = "#####3";
const PROYECTO_PRUEBA = "PROY-TEST-1";
const CENTRO_PRUEBA = "CENTRO-TEST-1";

const ROLE_KEYS = [
  "SUPER_ADMIN",
  "IAM_ADMIN",
  "AUDITOR",
  "PLD_ANALISTA",
  "PLD_APROBADOR",
  "VENTAS_ASESOR",
  "VENTAS_GERENTE",
  "OBRA_COORDINADOR",
  "FINANZAS_MANAGER",
  "TESORERIA_ANALISTA",
  "COMPRAS_ANALISTA",
  "CONTRALOR",
  "RRHH_SUPERVISOR_CENTRO",
  "RRHH_ADMIN",
  "EMPLEADO_SELF",
  "TICKETS_RESPONSABLE",
  "TICKETS_PARTICIPANTE",
];

const SCOPE_OPTIONS = [
  { value: "GLOBAL", label: "GLOBAL" },
  { value: "SOCIEDAD", label: `SOCIEDAD (${SOCIEDAD_PRUEBA})` },
  { value: "PROYECTO", label: `PROYECTO (${PROYECTO_PRUEBA})` },
];

function scopeIdDe(scopeType: string): string {
  if (scopeType === "SOCIEDAD") return SOCIEDAD_PRUEBA;
  if (scopeType === "PROYECTO") return PROYECTO_PRUEBA;
  return "*";
}

export default function DevRolesPage() {
  const [seleccionados, setSeleccionados] = useState<string[]>([]);
  const [scopeType, setScopeType] = useState("SOCIEDAD");
  const [conCentro, setConCentro] = useState(false);

  function toggle(roleKey: string) {
    setSeleccionados((prev) =>
      prev.includes(roleKey) ? prev.filter((r) => r !== roleKey) : [...prev, roleKey]
    );
  }

  const params = new URLSearchParams({
    role: seleccionados.join(","),
    scope_type: scopeType,
    scope_id: scopeIdDe(scopeType),
  });
  if (conCentro) params.set("centro_id", CENTRO_PRUEBA);
  const url = `${IAM_API_BASE_URL}/auth/dev/switch-role?${params.toString()}`;

  return (
    <div style={{ maxWidth: 640, margin: "40px auto", fontFamily: "sans-serif", padding: "0 16px" }}>
      <div
        style={{
          background: "#FEF3C7",
          border: "1px solid #F59E0B",
          borderRadius: 8,
          padding: "10px 16px",
          marginBottom: 24,
          fontSize: 14,
        }}
      >
        ⚠️ <strong>SOLO DESARROLLO</strong> — borrar antes de producción. Requiere haber
        iniciado sesión con Google al menos una vez; al aplicar, cambia el/los rol(es)
        activo(s) de tu sesión actual al instante, sin volver a pasar por Google.
      </div>

      <h1 style={{ fontSize: 20, marginBottom: 4 }}>Cambiar rol(es) de prueba</h1>
      <p style={{ fontSize: 13, color: "#555", marginBottom: 16 }}>
        Marca uno o varios roles — se aplican juntos (unión de permisos), mismo scope para
        todos los seleccionados.
      </p>

      <div style={{ marginBottom: 16, display: "flex", gap: 16, alignItems: "center", flexWrap: "wrap" }}>
        <label style={{ fontSize: 13 }}>
          Scope:{" "}
          <select value={scopeType} onChange={(e) => setScopeType(e.target.value)}>
            {SCOPE_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </select>
        </label>
        <label style={{ fontSize: 13 }}>
          <input type="checkbox" checked={conCentro} onChange={(e) => setConCentro(e.target.checked)} />{" "}
          + centro de prueba ({CENTRO_PRUEBA}) — para RRHH_SUPERVISOR_CENTRO
        </label>
      </div>

      <ul style={{ listStyle: "none", padding: 0, display: "flex", flexDirection: "column", gap: 6, marginBottom: 20 }}>
        {ROLE_KEYS.map((roleKey) => (
          <li key={roleKey}>
            <label
              style={{
                display: "flex",
                alignItems: "center",
                gap: 8,
                padding: "8px 12px",
                border: "1px solid #D1D5DB",
                borderRadius: 6,
                cursor: "pointer",
                background: seleccionados.includes(roleKey) ? "#EFF6FF" : "transparent",
              }}
            >
              <input
                type="checkbox"
                checked={seleccionados.includes(roleKey)}
                onChange={() => toggle(roleKey)}
              />
              {roleKey}
            </label>
          </li>
        ))}
      </ul>

      <a
        href={seleccionados.length > 0 ? url : undefined}
        aria-disabled={seleccionados.length === 0}
        style={{
          display: "inline-block",
          padding: "10px 20px",
          borderRadius: 6,
          textDecoration: "none",
          color: "#fff",
          background: seleccionados.length > 0 ? "#1C75BC" : "#9CA3AF",
          pointerEvents: seleccionados.length > 0 ? "auto" : "none",
        }}
      >
        Aplicar {seleccionados.length > 0 ? `(${seleccionados.length} rol${seleccionados.length > 1 ? "es" : ""})` : ""}
      </a>
    </div>
  );
}
