"use client";

import { useEffect, useState } from "react";
import {
  Alert,
  Checkbox,
  CircularProgress,
  FormControl,
  InputLabel,
  ListItemText,
  MenuItem,
  Paper,
  Select,
  SelectChangeEvent,
  Stack,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Tooltip,
  Typography,
} from "@mui/material";
import AppShell from "@/components/AppShell";
import { IamPermission, IamRole, listPermissions, listRoles } from "@/lib/iam";

// Matriz de permisos roles x servicios (Fase 1, Semana 5). Solo lectura -
// la gestion de roles/permisos (crear, editar, otorgar permiso a un rol)
// sigue pendiente, ver iam/views.py (IamRoleViewSet, IamPermissionViewSet).
//
// Cada IamPermission.perm_key tiene la forma "<servicio>.<accion>" (ver
// iam/migrations/0004_seed_permisos_matriz.py). En vez de una casilla por
// permiso individual (18 roles x ~40 permisos seria una tabla enorme e
// ilegible), se agrupa por servicio y se muestra que acciones (L/C/E/A)
// tiene el rol en ese servicio - mismo formato que
// docs/architecture/roles-y-permisos.md sec. 3, que el cliente ya conoce.
const LETRA_POR_ACCION: Record<string, string> = {
  leer: "L",
  crear: "C",
  editar: "E",
  aprobar: "A",
};

const NOMBRE_POR_ACCION: Record<string, string> = {
  leer: "Leer",
  crear: "Crear",
  editar: "Editar",
  aprobar: "Aprobar/autorizar",
};

// Orden fijo L-C-E-A (no alfabetico) para que coincida con la convencion
// del documento fuente.
const ORDEN_ACCIONES = ["leer", "crear", "editar", "aprobar"];

// Nicknames de area/servicio para mostrar en pantalla - el valor crudo
// (prefijo de IamPermission.perm_key, ver
// iam/migrations/0004_seed_permisos_matriz.py) sigue siendo el que se usa
// para filtrar/agrupar, esto es solo la etiqueta visible. Catalogo fijo:
// un area nueva que todavia no tenga nickname se muestra tal cual (nunca
// se oculta informacion por no tener traduccion).
const AREA_LABELS: Record<string, string> = {
  iam: "IAM",
  contrapartes: "Contrapartes",
  "pld-compliance": "PLD / Compliance",
  "ventas-vivienda": "Ventas / Vivienda",
  materiales: "Materiales",
  rentas: "Rentas",
  tesoreria: "Tesorería",
  "facturacion-cfdi": "Facturación CFDI",
  compras: "Compras",
  rrhh: "RRHH",
  tickets: "Tickets",
  audit: "Auditoría",
};

function friendlyAreaName(area: string): string {
  return AREA_LABELS[area] ?? area;
}

function agruparPorServicio(permisos: string[]): Map<string, Set<string>> {
  const porServicio = new Map<string, Set<string>>();
  for (const permKey of permisos) {
    const [servicio, accion] = permKey.split(".");
    if (!servicio || !accion) continue;
    if (!porServicio.has(servicio)) porServicio.set(servicio, new Set());
    porServicio.get(servicio)!.add(accion);
  }
  return porServicio;
}

function CeldaAcciones({ acciones }: { acciones: Set<string> | undefined }) {
  if (!acciones || acciones.size === 0) {
    return (
      <Typography variant="body2" color="text.secondary" align="center">
        —
      </Typography>
    );
  }
  const presentes = ORDEN_ACCIONES.filter((a) => acciones.has(a));
  return (
    <Tooltip title={presentes.map((a) => NOMBRE_POR_ACCION[a]).join(", ")}>
      <Typography
        variant="body2"
        align="center"
        sx={{ fontFamily: "monospace", letterSpacing: 1, fontWeight: "bold" }}
      >
        {presentes.map((a) => LETRA_POR_ACCION[a]).join("")}
      </Typography>
    </Tooltip>
  );
}

export default function MatrizPermisosPage() {
  const [roles, setRoles] = useState<IamRole[]>([]);
  const [permisos, setPermisos] = useState<IamPermission[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  // Filtro por area/servicio (Fase 1, Semana 5) - [] = sin filtro, se
  // muestran todas las areas. No se filtra en el backend: el catalogo
  // completo (roles + permisos) ya se trae una sola vez, filtrar aqui
  // evita ir y venir al servidor por cada cambio de seleccion.
  const [areasFiltro, setAreasFiltro] = useState<string[]>([]);

  useEffect(() => {
    setLoading(true);
    setError(null);
    Promise.all([listRoles(), listPermissions()])
      .then(([rolesData, permisosData]) => {
        setRoles(rolesData);
        setPermisos(permisosData);
      })
      .catch((err) => setError(err instanceof Error ? err.message : "Error desconocido"))
      .finally(() => setLoading(false));
  }, []);

  // Columnas = servicios distintos presentes en el catalogo completo de
  // permisos (no solo los que algun rol ya tiene), ordenados alfabeticamente.
  const todasLasAreas = Array.from(new Set(permisos.map((p) => p.perm_key.split(".")[0]))).sort();
  const servicios = areasFiltro.length > 0 ? todasLasAreas.filter((a) => areasFiltro.includes(a)) : todasLasAreas;

  // Con filtro activo, se ocultan los roles que no tengan ningun permiso
  // en ninguna de las areas elegidas - de otro modo quedarian filas con
  // puros "—", ruido sin informacion util para lo que se esta buscando.
  const rolesVisibles =
    areasFiltro.length > 0
      ? roles.filter((role) => role.permisos.some((permKey) => areasFiltro.includes(permKey.split(".")[0])))
      : roles;

  function handleAreasChange(event: SelectChangeEvent<string[]>) {
    const value = event.target.value;
    setAreasFiltro(typeof value === "string" ? value.split(",") : value);
  }

  return (
    <AppShell>
      <Typography variant="h5" gutterBottom>
        Matriz de permisos
      </Typography>
      
      {error && (
        <Alert severity="error" sx={{ mb: 2 }}>
          {error}
        </Alert>
      )}

      <Stack
        direction={{ xs: "column", sm: "row" }}
        spacing={2}
        sx={{ mb: 3 }}
        alignItems="center"
        justifyContent="center"
        flexWrap="wrap"
      >
        <Paper variant="outlined" sx={{ p: 2, textAlign: "center" }}>
          <Typography variant="body2" color="text.secondary" sx={{ mb: 1 }}>
            Permisos otorgados a cada rol, agrupados por servicio.
          </Typography>
          <Typography variant="body2" color="text.secondary" sx={{ fontWeight: "bold" }}>
            L = leer, C = crear, E = editar, A = aprobar/autorizar.
          </Typography>
        </Paper>

        <FormControl size="small" sx={{ minWidth: 260 }}>
          <InputLabel id="area-filter-label">Área</InputLabel>
          <Select
            labelId="area-filter-label"
            label="Área"
            multiple
            value={areasFiltro}
            onChange={handleAreasChange}
            renderValue={(selected) =>
              selected.length > 0 ? selected.map(friendlyAreaName).join(", ") : "Todas"
            }
          >
            {todasLasAreas.map((area) => (
              <MenuItem key={area} value={area}>
                <Checkbox size="small" checked={areasFiltro.includes(area)} />
                <ListItemText primary={friendlyAreaName(area)} />
              </MenuItem>
            ))}
          </Select>
        </FormControl>
      </Stack>

      <Paper variant="outlined">
        <TableContainer sx={{ overflowX: "auto" }}>
          <Table size="small">
            <TableHead>
              <TableRow>
                <TableCell sx={{ minWidth: 200, fontWeight: 600 }}>Rol</TableCell>
                {servicios.map((servicio) => (
                  <TableCell key={servicio} align="center" sx={{ minWidth: 90 }}>
                    {friendlyAreaName(servicio)}
                  </TableCell>
                ))}
              </TableRow>
            </TableHead>
            <TableBody>
              {loading ? (
                <TableRow>
                  <TableCell colSpan={servicios.length + 1} align="center" sx={{ py: 4 }}>
                    <CircularProgress size={24} />
                  </TableCell>
                </TableRow>
              ) : rolesVisibles.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={servicios.length + 1} align="center" sx={{ py: 4 }}>
                    <Typography variant="body2" color="text.secondary">
                      {areasFiltro.length > 0
                        ? "Ningún rol tiene permisos en las áreas seleccionadas."
                        : "Sin roles."}
                    </Typography>
                  </TableCell>
                </TableRow>
              ) : (
                rolesVisibles.map((role) => {
                  const porServicio = agruparPorServicio(role.permisos);
                  return (
                    <TableRow key={role.role_id} hover>
                      <TableCell>
                        <Typography variant="body2" fontWeight={600}>
                          {role.role_name}
                        </Typography>
                        <Typography variant="caption" color="text.secondary">
                          {role.role_key}
                        </Typography>
                      </TableCell>
                      {servicios.map((servicio) => (
                        <TableCell key={servicio}>
                          <CeldaAcciones acciones={porServicio.get(servicio)} />
                        </TableCell>
                      ))}
                    </TableRow>
                  );
                })
              )}
            </TableBody>
          </Table>
        </TableContainer>
      </Paper>
    </AppShell>
  );
}
