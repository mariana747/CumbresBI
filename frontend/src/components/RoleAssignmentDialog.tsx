"use client";

import { useEffect, useState } from "react";
import {
  Alert,
  Autocomplete,
  Button,
  Chip,
  CircularProgress,
  Dialog,
  DialogContent,
  DialogTitle,
  Divider,
  FormControl,
  IconButton,
  InputLabel,
  MenuItem,
  Select,
  Stack,
  TextField,
  Typography,
} from "@mui/material";
import { X as CloseIcon } from "lucide-react";
import { SessionUser, getSession } from "@/lib/auth";
import {
  GeneralSociedad,
  IamRole,
  IamUserCentroAccess,
  IamUserContratoAccess,
  IamUserRole,
  SCOPE_LABELS,
  grantCentroAccess,
  grantContratoAccess,
  grantRole,
  listAllCentroAccess,
  listAllContratoAccess,
  listCentroAccess,
  listContratoAccess,
  listRoleHistory,
  listSociedades,
  listUserRoles,
  revokeCentroAccess,
  revokeContratoAccess,
  revokeRole,
  scopeChipColor,
} from "@/lib/iam";

type ScopeType = "GLOBAL" | "SOCIEDAD" | "PROYECTO";

// Otorgar/revocar roles (Fase 1, Semana 5) con alcance real - antes solo
// otorgaba GLOBAL a fuerza (grantRole no mandaba scope_type/scope_id).
// CENTRO/CONTRATO van aparte abajo: son grants planos
// (iam_user_centro_access/iam_user_contrato_access), no scope_type de
// iam_user_roles (roles-y-permisos.md sec. 1) - ver memoria de sesion
// "pendiente-quitar-grupo-del-codigo" para el porque de esta separacion.
// Permisos reales ya conectados (iam.crear/iam.editar, mismo criterio en
// los 3 pares otorgar/revocar de aqui abajo) - el backend ya los exige
// desde la rama feature/iam-scoped-manager; esto solo evita mostrar
// botones que van a fallar con 403.
export default function RoleAssignmentDialog({
  open,
  onClose,
  userId,
  userLabel,
  allRoles,
  onChanged,
}: {
  open: boolean;
  onClose: () => void;
  userId: string;
  userLabel: string;
  allRoles: IamRole[];
  onChanged: () => void;
}) {
  const [userRoles, setUserRoles] = useState<IamUserRole[]>([]);
  const [selectedRole, setSelectedRole] = useState("");
  const [scopeType, setScopeType] = useState<ScopeType>("GLOBAL");
  const [scopeId, setScopeId] = useState("");
  // 31/Ago/2026 (pedido de Mariana: "en externos se debe asignar su
  // sociedad y proyecto") - un rol EXTERNO no usa el selector de Alcance
  // de arriba (GLOBAL/SOCIEDAD/PROYECTO, uno solo): exige los DOS a la
  // vez, asi que va en un formulario aparte con ambos campos obligatorios.
  // Por dentro sigue siendo el mismo mecanismo (dos IamUserRole - una
  // SOCIEDAD y una PROYECTO - que se combinan por union en el JWT, ver
  // compute_effective_scope_claims en iam-service), solo la UI cambia.
  const [sociedadExterno, setSociedadExterno] = useState("");
  const [proyectoExterno, setProyectoExterno] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [session, setSession] = useState<SessionUser | null>(null);

  useEffect(() => {
    getSession().then(setSession);
  }, []);

  const puedeCrear = session?.perm_keys.includes("iam.crear") ?? false;
  const puedeEditar = session?.perm_keys.includes("iam.editar") ?? false;
  const selectedRoleObj = allRoles.find((r) => r.role_id === selectedRole);
  const esExterno = selectedRoleObj?.tipo === "EXTERNO";

  const [sociedades, setSociedades] = useState<GeneralSociedad[]>([]);
  // Sugerencias freeSolo (no hay catalogo real de proyecto/centro/contrato
  // todavia, ver /admin/organizacion) - lo ya usado en el sistema, no una
  // lista cerrada.
  const [proyectoSugerencias, setProyectoSugerencias] = useState<string[]>([]);
  const [centroSugerencias, setCentroSugerencias] = useState<string[]>([]);
  const [contratoSugerencias, setContratoSugerencias] = useState<string[]>([]);
  const [centroAccess, setCentroAccess] = useState<IamUserCentroAccess[]>([]);
  const [centroInput, setCentroInput] = useState("");
  const [contratoAccess, setContratoAccess] = useState<IamUserContratoAccess[]>([]);
  const [contratoInput, setContratoInput] = useState("");

  function refresh() {
    setLoading(true);
    setError(null);
    Promise.all([listUserRoles(userId), listCentroAccess(userId), listContratoAccess(userId)])
      .then(([roles, centros, contratos]) => {
        setUserRoles(roles);
        setCentroAccess(centros);
        setContratoAccess(contratos);
      })
      .catch((err) => setError(err instanceof Error ? err.message : "Error desconocido"))
      .finally(() => setLoading(false));
  }

  useEffect(() => {
    if (open) refresh();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, userId]);

  // Catalogo de sociedades para el autocomplete de RFC (busqueda real via
  // ?search= en iam-service, no solo filtrado en memoria - por si el
  // catalogo crece mas alla de las 3 sociedades actuales).
  useEffect(() => {
    if (scopeType !== "SOCIEDAD" && !esExterno) return;
    const busqueda = esExterno ? sociedadExterno : scopeId;
    const timeout = setTimeout(() => {
      listSociedades(busqueda || undefined)
        .then(setSociedades)
        .catch(() => undefined);
    }, 250);
    return () => clearTimeout(timeout);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [scopeType, scopeId, esExterno, sociedadExterno]);

  // Sugerencias para Proyecto/Centro/Contrato - se cargan una vez al abrir
  // el dialogo (no hay catalogo real todavia, ver nota arriba).
  useEffect(() => {
    if (!open) return;
    listRoleHistory()
      .then((historial) => {
        const ids = new Set(
          historial.filter((h) => h.scope_type === "PROYECTO" && h.scope_id !== "*").map((h) => h.scope_id)
        );
        setProyectoSugerencias([...ids]);
      })
      .catch(() => undefined);
    listAllCentroAccess()
      .then((accesos) => setCentroSugerencias([...new Set(accesos.map((a) => a.centro_id))]))
      .catch(() => undefined);
    listAllContratoAccess()
      .then((accesos) => setContratoSugerencias([...new Set(accesos.map((a) => a.id_contrato))]))
      .catch(() => undefined);
  }, [open]);

  async function handleGrant() {
    if (!selectedRole) return;
    setError(null);
    try {
      if (esExterno) {
        // Rol EXTERNO: Sociedad Y Proyecto los dos, nunca GLOBAL (pedido
        // de Mariana) - dos IamUserRole (una por dimension), el backend
        // ya rechaza GLOBAL para estos roles como segunda linea de
        // defensa (ver IamUserRoleViewSet.perform_create).
        if (!sociedadExterno.trim() || !proyectoExterno.trim()) return;
        await grantRole(userId, selectedRole, "SOCIEDAD", sociedadExterno.trim());
        await grantRole(userId, selectedRole, "PROYECTO", proyectoExterno.trim());
        setSociedadExterno("");
        setProyectoExterno("");
      } else {
        if (scopeType !== "GLOBAL" && !scopeId.trim()) return;
        await grantRole(userId, selectedRole, scopeType, scopeType === "GLOBAL" ? "*" : scopeId.trim());
      }
      setSelectedRole("");
      setScopeType("GLOBAL");
      setScopeId("");
      refresh();
      onChanged();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error desconocido");
    }
  }

  async function handleRevoke(assignmentId: string) {
    setError(null);
    try {
      await revokeRole(assignmentId);
      refresh();
      onChanged();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error desconocido");
    }
  }

  async function handleGrantCentro() {
    if (!centroInput.trim()) return;
    setError(null);
    try {
      await grantCentroAccess(userId, centroInput.trim());
      setCentroInput("");
      refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error desconocido");
    }
  }

  async function handleRevokeCentro(id: number) {
    setError(null);
    try {
      await revokeCentroAccess(id);
      refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error desconocido");
    }
  }

  async function handleGrantContrato() {
    if (!contratoInput.trim()) return;
    setError(null);
    try {
      await grantContratoAccess(userId, contratoInput.trim());
      setContratoInput("");
      refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error desconocido");
    }
  }

  async function handleRevokeContrato(id: number) {
    setError(null);
    try {
      await revokeContratoAccess(id);
      refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error desconocido");
    }
  }

  const availableRoles = allRoles;

  return (
    <Dialog open={open} onClose={onClose} fullWidth maxWidth="xs">
      <DialogTitle sx={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        Roles y alcance de {userLabel}
        <IconButton onClick={onClose} size="small" aria-label="Cerrar">
          <CloseIcon size={18} strokeWidth={1.5} />
        </IconButton>
      </DialogTitle>
      <DialogContent dividers>
        {error && (
          <Alert severity="error" sx={{ mb: 2 }}>
            {error}
          </Alert>
        )}

        {loading ? (
          <CircularProgress size={20} />
        ) : (
          <>
            {/* Roles con alcance GLOBAL/SOCIEDAD/PROYECTO */}
            <Typography variant="overline" color="text.secondary">
              Roles
            </Typography>
            <Stack direction="row" flexWrap="wrap" useFlexGap gap={1} sx={{ mb: 2, mt: 0.5 }}>
              {userRoles.length === 0 ? (
                <Typography variant="body2" color="text.secondary">
                  Sin roles asignados.
                </Typography>
              ) : (
                userRoles.map((ur) => (
                  <Chip
                    key={ur.assignment_id}
                    color={scopeChipColor(ur.scope_type)}
                    label={
                      ur.scope_type === "GLOBAL"
                        ? `${ur.role_name} · ${SCOPE_LABELS[ur.scope_type]}`
                        : `${ur.role_name} · ${SCOPE_LABELS[ur.scope_type] ?? ur.scope_type} ${ur.scope_id}`
                    }
                    onDelete={puedeEditar ? () => handleRevoke(ur.assignment_id) : undefined}
                  />
                ))
              )}
            </Stack>

            <Stack spacing={1} sx={{ mb: 3 }}>
              <FormControl size="small" fullWidth>
                <InputLabel id="grant-role-label">Otorgar rol</InputLabel>
                <Select
                  labelId="grant-role-label"
                  label="Otorgar rol"
                  value={selectedRole}
                  onChange={(e) => setSelectedRole(e.target.value)}
                >
                  {availableRoles.map((r) => (
                    <MenuItem key={r.role_id} value={r.role_id}>
                      {r.role_name}
                    </MenuItem>
                  ))}
                </Select>
              </FormControl>
              {esExterno ? (
                // Rol EXTERNO (31/Ago/2026): nada de selector de Alcance -
                // Sociedad Y Proyecto son obligatorios los dos, siempre.
                <Stack spacing={1}>
                  <Alert severity="info" sx={{ py: 0.5 }}>
                    Rol externo: hay que acotarlo a una Sociedad y un Proyecto, nunca GLOBAL.
                  </Alert>
                  <Stack direction={{ xs: "column", sm: "row" }} spacing={1}>
                    <Autocomplete
                      openOnFocus
                      size="small"
                      fullWidth
                      options={sociedades}
                      getOptionLabel={(s) => `${s.razon_social ?? s.rfc} (${s.rfc})`}
                      isOptionEqualToValue={(a, b) => a.rfc === b.rfc}
                      onInputChange={(_, value) => setSociedadExterno(value)}
                      onChange={(_, value) => setSociedadExterno(value?.rfc ?? "")}
                      renderInput={(params) => <TextField {...params} label="Sociedad *" />}
                    />
                    <Autocomplete
                      freeSolo
                      openOnFocus
                      size="small"
                      fullWidth
                      options={proyectoSugerencias}
                      noOptionsText="Sin sugerencias aún — escribe uno nuevo"
                      inputValue={proyectoExterno}
                      onInputChange={(_, value) => setProyectoExterno(value)}
                      renderInput={(params) => <TextField {...params} label="Proyecto *" />}
                    />
                  </Stack>
                  <Button
                    variant="contained"
                    disabled={!selectedRole || !sociedadExterno.trim() || !proyectoExterno.trim() || !puedeCrear}
                    onClick={handleGrant}
                  >
                    Otorgar
                  </Button>
                </Stack>
              ) : (
                <Stack direction={{ xs: "column", sm: "row" }} spacing={1}>
                  <FormControl size="small" sx={{ minWidth: 130 }}>
                    <InputLabel id="scope-type-label">Alcance</InputLabel>
                    <Select
                      labelId="scope-type-label"
                      label="Alcance"
                      value={scopeType}
                      onChange={(e) => {
                        setScopeType(e.target.value as ScopeType);
                        setScopeId("");
                      }}
                    >
                      <MenuItem value="GLOBAL">GLOBAL</MenuItem>
                      <MenuItem value="SOCIEDAD">SOCIEDAD</MenuItem>
                      <MenuItem value="PROYECTO">PROYECTO</MenuItem>
                    </Select>
                  </FormControl>
                  {scopeType === "SOCIEDAD" && (
                    <Autocomplete
                      openOnFocus
                      size="small"
                      fullWidth
                      options={sociedades}
                      getOptionLabel={(s) => `${s.razon_social ?? s.rfc} (${s.rfc})`}
                      isOptionEqualToValue={(a, b) => a.rfc === b.rfc}
                      onInputChange={(_, value) => setScopeId(value)}
                      onChange={(_, value) => setScopeId(value?.rfc ?? "")}
                      renderInput={(params) => <TextField {...params} label="Sociedad" />}
                    />
                  )}
                  {scopeType === "PROYECTO" && (
                    // Sin catalogo real todavia (vivienda_proyectos, Fase 3, sin
                    // construir) - freeSolo: sugiere IDs de proyecto ya usados
                    // antes en el sistema, pero deja escribir uno nuevo.
                    <Autocomplete
                      freeSolo
                      openOnFocus
                      size="small"
                      fullWidth
                      options={proyectoSugerencias}
                      noOptionsText="Sin sugerencias aún — escribe uno nuevo"
                      inputValue={scopeId}
                      onInputChange={(_, value) => setScopeId(value)}
                      renderInput={(params) => <TextField {...params} label="ID de proyecto" />}
                    />
                  )}
                  <Button
                    variant="contained"
                    disabled={!selectedRole || (scopeType !== "GLOBAL" && !scopeId.trim()) || !puedeCrear}
                    onClick={handleGrant}
                    sx={{ whiteSpace: "nowrap" }}
                  >
                    Otorgar
                  </Button>
                </Stack>
              )}
            </Stack>

            <Divider sx={{ mb: 2 }} />

            {/* CENTRO - grant plano, no es scope_type de iam_user_roles */}
            <Typography variant="overline" color="text.secondary">
              Acceso a Centro
            </Typography>
            <Stack direction="row" flexWrap="wrap" useFlexGap gap={1} sx={{ mb: 1, mt: 0.5 }}>
              {centroAccess.length === 0 ? (
                <Typography variant="body2" color="text.secondary">
                  Sin centros asignados.
                </Typography>
              ) : (
                centroAccess.map((c) => (
                  <Chip
                    key={c.id}
                    label={c.centro_id}
                    onDelete={puedeEditar ? () => handleRevokeCentro(c.id) : undefined}
                  />
                ))
              )}
            </Stack>
            <Stack direction="row" spacing={1} sx={{ mb: 3 }}>
              <Autocomplete
                freeSolo
                openOnFocus
                size="small"
                fullWidth
                options={centroSugerencias}
                noOptionsText="Sin sugerencias aún — escribe uno nuevo"
                inputValue={centroInput}
                onInputChange={(_, value) => setCentroInput(value)}
                renderInput={(params) => <TextField {...params} label="ID de centro" />}
              />
              <Button variant="outlined" disabled={!centroInput.trim() || !puedeCrear} onClick={handleGrantCentro}>
                Otorgar
              </Button>
            </Stack>

            {/* CONTRATO - grant plano, mismo criterio que Centro */}
            <Typography variant="overline" color="text.secondary">
              Acceso a Contrato
            </Typography>
            <Stack direction="row" flexWrap="wrap" useFlexGap gap={1} sx={{ mb: 1, mt: 0.5 }}>
              {contratoAccess.length === 0 ? (
                <Typography variant="body2" color="text.secondary">
                  Sin contratos asignados.
                </Typography>
              ) : (
                contratoAccess.map((c) => (
                  <Chip
                    key={c.id}
                    label={c.id_contrato}
                    onDelete={puedeEditar ? () => handleRevokeContrato(c.id) : undefined}
                  />
                ))
              )}
            </Stack>
            <Stack direction="row" spacing={1}>
              <Autocomplete
                freeSolo
                openOnFocus
                size="small"
                fullWidth
                options={contratoSugerencias}
                noOptionsText="Sin sugerencias aún — escribe uno nuevo"
                inputValue={contratoInput}
                onInputChange={(_, value) => setContratoInput(value)}
                renderInput={(params) => <TextField {...params} label="ID de contrato" />}
              />
              <Button variant="outlined" disabled={!contratoInput.trim() || !puedeCrear} onClick={handleGrantContrato}>
                Otorgar
              </Button>
            </Stack>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
