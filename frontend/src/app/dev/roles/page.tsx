"use client";

import { useEffect, useState } from "react";
import { GATEWAY_URL } from "@/lib/gatewayUrl";
import { IamRole, listRoles } from "@/lib/iam";

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

// Las 3 sociedades reales sembradas (iam-service, migracion 0006_seed_sociedades)
// - RFC placeholder "#####N" a proposito, el cliente todavia no dio el RFC
// fiscal real (ver memoria de sesion "empresas-alcance-fase1").
const SOCIEDADES_PRUEBA = [
  { rfc: "#####1", nombre: "CIF TIZARA" },
  { rfc: "#####2", nombre: "TIZARA CAPITAL" },
  { rfc: "#####3", nombre: "CONSULTORÍA Y PROYECTOS CUMBRES" },
];
// Proyecto NO tiene catalogo real todavia (pertenece a Vivienda, sin
// construir) - siguen siendo IDs de ejemplo, solo se agregaron mas para
// poder probar "un usuario ve P1 pero no P2" en la misma sesion de pruebas.
// 3 caracteres (31/Ago/2026): es el limite mas estrecho entre los
// servicios que ya consumen SCOPE_FIELD_PROYECTO (TesoreriaContrato.proyecto
// y ObraLote.proyecto son CharField(max_length=3)) - un id mas largo
// truena al crear datos de prueba en esos dos, aunque quepa en
// materiales/vivienda (max_length=8).
const PROYECTOS_PRUEBA = ["P01", "P02", "P03"];
const CENTRO_PRUEBA = "CENTRO-TEST-1";
// Mismos id_contrato de los Contratos reales creados a mano en
// tesoreria-service (31/Ago/2026, ver memoria de sesion) para poder
// probar SCOPE_FIELD_CONTRATO desde esta pantalla - uno por sociedad, para
// poder probar "un usuario ve el contrato X pero no el Y".
const CONTRATOS_PRUEBA = [
  { id: "DEVTEST-CONTRATO-001", nombre: "DEVTEST-CONTRATO-001 (CONSULTORÍA Y PROYECTOS CUMBRES)" },
  { id: "DEVTEST-CONTRATO-002", nombre: "DEVTEST-CONTRATO-002 (CIF TIZARA)" },
];

// 31/Ago/2026: antes era una lista fija en el codigo (ROLE_KEYS) - un rol
// nuevo creado desde /admin/permisos (ej. ABOGADA_EXTERNA) no aparecia
// aqui hasta editar este archivo a mano. Ahora se trae del catalogo real
// (listRoles(), mismo endpoint que /admin/permisos) - cualquier rol nuevo
// aparece solo, sin tocar codigo. Roles inactivos (soft-delete, ver
// IamRole.activo) se muestran igual pero marcados, para poder reactivar
// alguno de prueba sin ir a /admin/permisos.

const SCOPE_OPTIONS = [
  { value: "GLOBAL", label: "GLOBAL" },
  { value: "SOCIEDAD", label: "SOCIEDAD" },
  { value: "PROYECTO", label: "PROYECTO" },
];

export default function DevRolesPage() {
  const [roles, setRoles] = useState<IamRole[]>([]);
  const [loadingRoles, setLoadingRoles] = useState(true);
  useEffect(() => {
    listRoles()
      .then((r) => setRoles([...r].sort((a, b) => a.role_key.localeCompare(b.role_key))))
      .catch(() => setRoles([]))
      .finally(() => setLoadingRoles(false));
  }, []);

  const [seleccionados, setSeleccionados] = useState<string[]>([]);
  const [scopeType, setScopeType] = useState("SOCIEDAD");
  // 31/Ago/2026 (pedido de Mariana: "pon para que pueda seleccionar mas de
  // dos sociedades") - varias a la vez, para simular un analista con
  // acceso a mas de una sociedad (dev_views.py acepta "?scope_id=A,B" y
  // crea una IamUserRole por cada una, se juntan por UNION igual que en
  // produccion - ver scope_utils.py::compute_effective_scope_claims).
  const [sociedadIds, setSociedadIds] = useState<string[]>([SOCIEDADES_PRUEBA[0].rfc]);
  const [proyectoId, setProyectoId] = useState(PROYECTOS_PRUEBA[0]);
  const [conCentro, setConCentro] = useState(false);
  const [conContrato, setConContrato] = useState(false);
  const [contratoId, setContratoId] = useState(CONTRATOS_PRUEBA[0].id);

  function toggle(roleKey: string) {
    setSeleccionados((prev) =>
      prev.includes(roleKey) ? prev.filter((r) => r !== roleKey) : [...prev, roleKey]
    );
  }

  function toggleSociedad(rfc: string) {
    setSociedadIds((prev) => (prev.includes(rfc) ? prev.filter((r) => r !== rfc) : [...prev, rfc]));
  }

  const scopeId = scopeType === "SOCIEDAD" ? sociedadIds.join(",") : scopeType === "PROYECTO" ? proyectoId : "*";
  const params = new URLSearchParams({
    role: seleccionados.join(","),
    scope_type: scopeType,
    scope_id: scopeId || "*",
  });
  if (conCentro) params.set("centro_id", CENTRO_PRUEBA);
  if (conContrato) params.set("contrato_id", contratoId);
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

        {scopeType === "SOCIEDAD" && (
          <div style={{ display: "flex", gap: 12, alignItems: "center", flexWrap: "wrap" }}>
            <span style={{ fontSize: 13 }}>Sociedad(es):</span>
            {SOCIEDADES_PRUEBA.map((s) => (
              <label key={s.rfc} style={{ fontSize: 13, display: "flex", alignItems: "center", gap: 4 }}>
                <input
                  type="checkbox"
                  checked={sociedadIds.includes(s.rfc)}
                  onChange={() => toggleSociedad(s.rfc)}
                />
                {s.nombre}
              </label>
            ))}
          </div>
        )}

        {scopeType === "PROYECTO" && (
          <label style={{ fontSize: 13 }}>
            Proyecto:{" "}
            <select value={proyectoId} onChange={(e) => setProyectoId(e.target.value)}>
              {PROYECTOS_PRUEBA.map((p) => (
                <option key={p} value={p}>
                  {p}
                </option>
              ))}
            </select>
          </label>
        )}

        <label style={{ fontSize: 13 }}>
          <input type="checkbox" checked={conCentro} onChange={(e) => setConCentro(e.target.checked)} />{" "}
          + centro de prueba ({CENTRO_PRUEBA}) — para RRHH_SUPERVISOR_CENTRO
        </label>

        <label style={{ fontSize: 13 }}>
          <input type="checkbox" checked={conContrato} onChange={(e) => setConContrato(e.target.checked)} />{" "}
          + contrato de prueba — para SCOPE_FIELD_CONTRATO (Tesorería)
        </label>
        {conContrato && (
          <label style={{ fontSize: 13 }}>
            Contrato:{" "}
            <select value={contratoId} onChange={(e) => setContratoId(e.target.value)}>
              {CONTRATOS_PRUEBA.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.nombre}
                </option>
              ))}
            </select>
          </label>
        )}
      </div>

      {loadingRoles ? (
        <p style={{ fontSize: 13, color: "#555" }}>Cargando catálogo de roles…</p>
      ) : (
        <ul style={{ listStyle: "none", padding: 0, display: "flex", flexDirection: "column", gap: 6, marginBottom: 20 }}>
          {roles.map((role) => (
            <li key={role.role_id}>
              <label
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 8,
                  padding: "8px 12px",
                  border: "1px solid #D1D5DB",
                  borderRadius: 6,
                  cursor: role.activo ? "pointer" : "not-allowed",
                  opacity: role.activo ? 1 : 0.5,
                  background: seleccionados.includes(role.role_key) ? "#EFF6FF" : "transparent",
                }}
              >
                <input
                  type="checkbox"
                  disabled={!role.activo}
                  checked={seleccionados.includes(role.role_key)}
                  onChange={() => toggle(role.role_key)}
                />
                {role.role_name} <span style={{ color: "#888" }}>({role.role_key})</span>
                {!role.activo && <span style={{ color: "#B91C1C" }}> — inactivo</span>}
              </label>
            </li>
          ))}
        </ul>
      )}

      {(() => {
        const puedeAplicar =
          seleccionados.length > 0 && (scopeType !== "SOCIEDAD" || sociedadIds.length > 0);
        return (
          <a
            href={puedeAplicar ? url : undefined}
            aria-disabled={!puedeAplicar}
            style={{
              display: "inline-block",
              padding: "10px 20px",
              borderRadius: 6,
              textDecoration: "none",
              color: "#fff",
              background: puedeAplicar ? "#1C75BC" : "#9CA3AF",
              pointerEvents: puedeAplicar ? "auto" : "none",
            }}
          >
            Aplicar {seleccionados.length > 0 ? `(${seleccionados.length} rol${seleccionados.length > 1 ? "es" : ""})` : ""}
          </a>
        );
      })()}
    </div>
  );
}
