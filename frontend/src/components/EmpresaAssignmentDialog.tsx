"use client";

import { useEffect, useState } from "react";
import {
  Alert,
  Button,
  Chip,
  CircularProgress,
  Dialog,
  DialogContent,
  DialogTitle,
  FormControl,
  IconButton,
  InputLabel,
  MenuItem,
  Select,
  Stack,
  Typography,
} from "@mui/material";
import { X as CloseIcon } from "lucide-react";
import { SessionUser, getSession } from "@/lib/auth";
import { IamGroup, IamUserGroup, assignGroup, listUserGroups, removeUserGroup } from "@/lib/iam";

// Cambiar la empresa de un usuario desde el Directorio (icono de lapiz en
// la columna "Empresa") - mismo patron que RoleAssignmentDialog. Permisos
// reales ya conectados (IamUserGroupViewSet: asignar=iam.crear,
// quitar=iam.editar).
export default function EmpresaAssignmentDialog({
  open,
  onClose,
  userId,
  userLabel,
  allGroups,
  onChanged,
}: {
  open: boolean;
  onClose: () => void;
  userId: string;
  userLabel: string;
  allGroups: IamGroup[];
  onChanged: () => void;
}) {
  const [userGroups, setUserGroups] = useState<IamUserGroup[]>([]);
  const [selectedGroup, setSelectedGroup] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [session, setSession] = useState<SessionUser | null>(null);

  useEffect(() => {
    getSession().then(setSession);
  }, []);

  const puedeCrear = session?.perm_keys.includes("iam.crear") ?? false;
  const puedeEditar = session?.perm_keys.includes("iam.editar") ?? false;

  function refresh() {
    setLoading(true);
    setError(null);
    listUserGroups(userId)
      .then(setUserGroups)
      .catch((err) => setError(err instanceof Error ? err.message : "Error desconocido"))
      .finally(() => setLoading(false));
  }

  useEffect(() => {
    if (open) refresh();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, userId]);

  async function handleAssign() {
    if (!selectedGroup) return;
    setError(null);
    try {
      await assignGroup(userId, selectedGroup);
      setSelectedGroup("");
      refresh();
      onChanged();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error desconocido");
    }
  }

  async function handleRemove(userGroupId: number) {
    setError(null);
    try {
      await removeUserGroup(userGroupId);
      refresh();
      onChanged();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error desconocido");
    }
  }

  const availableGroups = allGroups.filter(
    (g) => !userGroups.some((ug) => ug.group === g.group_id)
  );

  return (
    <Dialog open={open} onClose={onClose} fullWidth maxWidth="xs">
      <DialogTitle sx={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        Empresa de {userLabel}
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
          <Stack direction="row" flexWrap="wrap" useFlexGap gap={1} sx={{ mb: 3 }}>
            {userGroups.length === 0 ? (
              <Typography variant="body2" color="text.secondary">
                Sin empresa asignada.
              </Typography>
            ) : (
              userGroups.map((ug) => (
                <Chip
                  key={ug.id}
                  label={ug.group_alias || ug.group_nombre}
                  onDelete={puedeEditar ? () => handleRemove(ug.id) : undefined}
                />
              ))
            )}
          </Stack>
        )}

        <Stack direction="row" spacing={1}>
          <FormControl size="small" fullWidth>
            <InputLabel id="assign-group-label">Cambiar a</InputLabel>
            <Select
              labelId="assign-group-label"
              label="Cambiar a"
              value={selectedGroup}
              onChange={(e) => setSelectedGroup(e.target.value)}
            >
              {availableGroups.map((g) => (
                <MenuItem key={g.group_id} value={g.group_id}>
                  {g.alias || g.nombre}
                </MenuItem>
              ))}
            </Select>
          </FormControl>
          <Button variant="contained" disabled={!selectedGroup || !puedeCrear} onClick={handleAssign}>
            Asignar
          </Button>
        </Stack>
      </DialogContent>
    </Dialog>
  );
}
