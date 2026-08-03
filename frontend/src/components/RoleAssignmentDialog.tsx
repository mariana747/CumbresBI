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
import { IamRole, IamUserRole, grantRole, listUserRoles, revokeRole } from "@/lib/iam";

// Otorgar/revocar roles (Fase 1, Semana 5). Sin permisos reales todavia -
// cualquiera con acceso a esta pantalla puede otorgar/revocar (ver nota en
// iam-service/iam/serializers.py); se restringe cuando exista JWT/scope.
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
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function refresh() {
    setLoading(true);
    setError(null);
    listUserRoles(userId)
      .then(setUserRoles)
      .catch((err) => setError(err instanceof Error ? err.message : "Error desconocido"))
      .finally(() => setLoading(false));
  }

  useEffect(() => {
    if (open) refresh();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, userId]);

  async function handleGrant() {
    if (!selectedRole) return;
    setError(null);
    try {
      await grantRole(userId, selectedRole);
      setSelectedRole("");
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

  const availableRoles = allRoles.filter(
    (r) => !userRoles.some((ur) => ur.role === r.role_id)
  );

  return (
    <Dialog open={open} onClose={onClose} fullWidth maxWidth="xs">
      <DialogTitle sx={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        Roles de {userLabel}
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
            {userRoles.length === 0 ? (
              <Typography variant="body2" color="text.secondary">
                Sin roles asignados.
              </Typography>
            ) : (
              userRoles.map((ur) => (
                <Chip
                  key={ur.assignment_id}
                  label={ur.role_name}
                  onDelete={() => handleRevoke(ur.assignment_id)}
                />
              ))
            )}
          </Stack>
        )}

        <Stack direction="row" spacing={1}>
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
          <Button variant="contained" disabled={!selectedRole} onClick={handleGrant}>
            Otorgar
          </Button>
        </Stack>
      </DialogContent>
    </Dialog>
  );
}
