"use client";

import { useEffect, useState } from "react";
import {
  Alert,
  Button,
  Chip,
  CircularProgress,
  FormControl,
  InputAdornment,
  InputLabel,
  MenuItem,
  Paper,
  Select,
  Stack,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  TextField,
  Typography,
} from "@mui/material";
import { Copy, Link2, Search } from "lucide-react";
import AppShell from "@/components/AppShell";
import { SessionUser, getSession } from "@/lib/auth";
import { GeneralSociedad, listSociedades } from "@/lib/iam";
import { BRAND } from "@/theme/theme";
import {
  PldContraparteKyc,
  PldTicketCliente,
  createTicketCliente,
  listKyc,
  listTicketsCliente,
  revocarTicketCliente,
} from "@/lib/pld";

const ESTADO_LLENADO_LABELS: Record<string, string> = {
  PENDIENTE: "Pendiente",
  INCOMPLETO: "Incompleto",
  ENTREGADO: "Entregado",
};

// Tickets de Cliente externo para KYC (Fase 2, Semana 9 - "Workflow de
// expediente y formularios públicos"). Mismo patrón de pantalla que
// /admin/invitaciones (pestaña "Temporales") (iam-service) pero simplificado - sin carga masiva
// por CSV, no la pidió el negocio para este flujo todavía. Modo dev: sin
// envío de correo real (mismo gap que Magic Links) - el link se muestra
// aquí directamente.
export default function TicketsClientePage() {
  const [email, setEmail] = useState("");
  const [kycId, setKycId] = useState("");
  const [expiresInMinutes, setExpiresInMinutes] = useState(30);
  const [maxUses, setMaxUses] = useState(1);
  const [creando, setCreando] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [ultimoGenerado, setUltimoGenerado] = useState<PldTicketCliente | null>(null);
  const [issuedBy, setIssuedBy] = useState<string | null>(null);
  const [session, setSession] = useState<SessionUser | null>(null);

  const [expedientes, setExpedientes] = useState<PldContraparteKyc[]>([]);
  const [tickets, setTickets] = useState<PldTicketCliente[]>([]);
  const [loading, setLoading] = useState(true);
  const [sociedades, setSociedades] = useState<GeneralSociedad[]>([]);
  // 31/Ago/2026 (pedido de Mariana: "igual en tickets debe tener filtro",
  // "esta parte que sea igual para tickets de clientes" - misma fila
  // Buscar/Estado/Sociedad que /pld). Sociedad va al backend (acota el
  // scope real de la vista); Buscar/Estado son del lado del cliente - el
  // "estado" de un ticket (Activo/Revocado/Expirado/Usado) se calcula en
  // memoria (ver estadoDe() mas abajo), no es una columna propia.
  const [filtroSociedad, setFiltroSociedad] = useState("");
  const [search, setSearch] = useState("");
  const [filtroEstado, setFiltroEstado] = useState("");

  function refrescarLista() {
    setLoading(true);
    listTicketsCliente(undefined, filtroSociedad || undefined)
      .then(setTickets)
      .catch((err) => setError(err instanceof Error ? err.message : "Error desconocido"))
      .finally(() => setLoading(false));
  }

  useEffect(() => {
    refrescarLista();
    listKyc()
      .then(setExpedientes)
      .catch(() => undefined);
    listSociedades()
      .then(setSociedades)
      .catch(() => setSociedades([]));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filtroSociedad]);

  useEffect(() => {
    // issued_by se toma de la sesion real (OIDC ya conectado) - a
    // diferencia de flujos viejos como aprobarKyc, que todavia piden el ID
    // a mano porque se construyeron antes de que existiera login real.
    getSession()
      .then((s) => {
        setSession(s);
        setIssuedBy(s?.user_id ?? null);
      })
      .catch(() => undefined);
  }, []);

  // Mismo criterio que PldTicketClienteViewSet.get_permissions
  // (crear=pld-compliance.crear, revocar=pld-compliance.editar).
  const puedeCrear = session?.perm_keys.includes("pld-compliance.crear") ?? false;
  const puedeEditar = session?.perm_keys.includes("pld-compliance.editar") ?? false;

  // 31/Ago/2026 (pedido de Mariana: "en el filtro de sociedades solo
  // deben aparecer las activas para ese rol - en global o super admin asi
  // esta bien") - mismo criterio que /pld.
  const sociedadesDelFiltro =
    session?.is_global || !session ? sociedades : sociedades.filter((s) => session.sociedad_rfcs.includes(s.rfc));

  function expedienteLabel(kyc: PldContraparteKyc): string {
    return `${kyc.id_contraparte}${kyc.curp ? ` · ${kyc.curp}` : ""} — ${
      ESTADO_LLENADO_LABELS[kyc.estado_llenado] ?? kyc.estado_llenado
    }`;
  }

  function expedienteNombre(id: string | null): string {
    if (!id) return "—";
    const kyc = expedientes.find((k) => k.id_kyc === id);
    return kyc ? expedienteLabel(kyc) : id;
  }

  async function handleGenerar(e: React.FormEvent) {
    e.preventDefault();
    if (!issuedBy) {
      setError("No se pudo identificar tu sesión - vuelve a iniciar sesión e intenta de nuevo.");
      return;
    }
    setCreando(true);
    setError(null);
    try {
      const nuevo = await createTicketCliente({
        kycId: kycId || undefined,
        email,
        issuedBy,
        expiresInMinutes,
        maxUses,
      });
      setUltimoGenerado(nuevo);
      setEmail("");
      setKycId("");
      refrescarLista();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error al generar el ticket");
    } finally {
      setCreando(false);
    }
  }

  async function handleRevocar(idPldTicket: string) {
    try {
      await revocarTicketCliente(idPldTicket);
      refrescarLista();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error al revocar");
    }
  }

  function estadoDe(ticket: PldTicketCliente): { label: string; color: "success" | "default" | "error" | "warning" } {
    if (ticket.revoked_at) return { label: "Revocado", color: "error" };
    if (new Date(ticket.expires_at) < new Date()) return { label: "Expirado", color: "warning" };
    if (ticket.uses_count >= ticket.max_uses) return { label: "Usado", color: "default" };
    return { label: "Activo", color: "success" };
  }

  // Buscar/Estado son del lado del cliente (31/Ago/2026) - el estado de un
  // ticket se calcula en memoria (estadoDe arriba), no hay columna propia
  // que el backend pueda filtrar.
  const ticketsVisibles = tickets.filter((t) => {
    if (search && !t.email.toLowerCase().includes(search.toLowerCase())) return false;
    if (filtroEstado && estadoDe(t).label !== filtroEstado) return false;
    return true;
  });

  const linkGenerado = ultimoGenerado?.token
    ? `${typeof window !== "undefined" ? window.location.origin : ""}/pld-ticket/${ultimoGenerado.token}`
    : "";

  return (
    <AppShell>
      <Typography variant="h5" gutterBottom>
        Tickets de Cliente
      </Typography>
      <Typography variant="body2" color="text.secondary" sx={{ mb: 3 }}>
        Acceso de un solo uso para un cliente externo, para llenar o consultar su expediente KYC sin
        cuenta de Workspace. Modo desarrollo — sin envío de correo real todavía, el link se muestra
        aquí directamente en vez de enviarse por email.
      </Typography>

      {error && (
        <Alert severity="error" sx={{ mb: 2 }}>
          {error}
        </Alert>
      )}

      {/* Bloque completo oculto (no solo el boton) para quien no tiene
      pld-compliance.crear - decision de producto 11/Ago/2026: sin
      permiso de generar, mostrar los campos del formulario no lleva a
      nada util (distinto de otorgar/revocar en otras pantallas, que se
      dejan visibles-deshabilitados). */}
      {puedeCrear && (
        <Paper variant="outlined" sx={{ p: 3, mb: 3 }}>
          <Typography variant="subtitle1" fontWeight={600} gutterBottom>
            Generar ticket
          </Typography>
          <Stack component="form" direction={{ xs: "column", sm: "row" }} spacing={2} onSubmit={handleGenerar}>
            <TextField
              size="small"
              label="Correo del cliente"
              type="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              sx={{ flex: 2 }}
            />
            <FormControl size="small" sx={{ flex: 1, minWidth: 200 }}>
              <InputLabel id="kyc-label">Expediente</InputLabel>
              <Select labelId="kyc-label" label="Expediente" value={kycId} onChange={(e) => setKycId(e.target.value)}>
                <MenuItem value="">
                  <em>Sin expediente específico</em>
                </MenuItem>
                {expedientes.map((k) => (
                  <MenuItem key={k.id_kyc} value={k.id_kyc}>
                    {expedienteLabel(k)}
                  </MenuItem>
                ))}
              </Select>
            </FormControl>
            <TextField
              size="small"
              label="Expira en (min)"
              type="number"
              value={expiresInMinutes}
              onChange={(e) => setExpiresInMinutes(Number(e.target.value) || 30)}
              sx={{ width: 130 }}
            />
            <TextField
              size="small"
              label="Máx. usos"
              type="number"
              value={maxUses}
              onChange={(e) => setMaxUses(Number(e.target.value) || 1)}
              sx={{ width: 110 }}
            />
            <Button
              type="submit"
              variant="contained"
              startIcon={<Link2 size={16} strokeWidth={1.5} />}
              disabled={creando || !issuedBy}
            >
              {creando ? <CircularProgress size={20} color="inherit" /> : "Generar"}
            </Button>
          </Stack>
        </Paper>
      )}

      {ultimoGenerado && (
        <Alert severity="info" sx={{ mt: 2, mb: 3 }} icon={<Copy size={18} strokeWidth={1.5} />}>
          Ticket generado para <strong>{ultimoGenerado.email}</strong> (expira el{" "}
          {new Date(ultimoGenerado.expires_at).toLocaleString("es-MX")}):
          <Typography
            component="pre"
            variant="caption"
            sx={{ mt: 1, wordBreak: "break-all", whiteSpace: "pre-wrap" }}
          >
            {linkGenerado}
          </Typography>
        </Alert>
      )}

      <Paper variant="outlined" sx={{ p: 3 }}>
        <Stack direction="row" spacing={1.5} alignItems="center" sx={{ mb: 2 }}>
          <Link2 size={22} strokeWidth={1.5} color={BRAND.azul} />
          <Typography variant="subtitle1" fontWeight={600}>
            Tickets generados
          </Typography>
        </Stack>

        <Stack direction={{ xs: "column", sm: "row" }} spacing={2} sx={{ mb: 3 }} flexWrap="wrap" useFlexGap>
        <TextField
          size="small"
          placeholder="Buscar por correo..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          sx={{ flex: 1, maxWidth: 300 }}
          InputProps={{
            startAdornment: (
              <InputAdornment position="start">
                <Search size={16} strokeWidth={1.5} />
              </InputAdornment>
            ),
          }}
        />
        <FormControl size="small" sx={{ minWidth: 180 }}>
          <InputLabel id="estado-filter-ticket-label">Estado</InputLabel>
          <Select
            labelId="estado-filter-ticket-label"
            label="Estado"
            value={filtroEstado}
            onChange={(e) => setFiltroEstado(e.target.value)}
          >
            <MenuItem value="">Todos</MenuItem>
            <MenuItem value="Activo">Activo</MenuItem>
            <MenuItem value="Revocado">Revocado</MenuItem>
            <MenuItem value="Expirado">Expirado</MenuItem>
            <MenuItem value="Usado">Usado</MenuItem>
          </Select>
        </FormControl>
        <FormControl size="small" sx={{ minWidth: 200 }}>
          <InputLabel id="sociedad-filter-ticket-label">Sociedad</InputLabel>
          <Select
            labelId="sociedad-filter-ticket-label"
            label="Sociedad"
            value={filtroSociedad}
            onChange={(e) => setFiltroSociedad(e.target.value)}
          >
            <MenuItem value="">Todas</MenuItem>
            {sociedadesDelFiltro.map((sociedad) => (
              <MenuItem key={sociedad.rfc} value={sociedad.rfc}>
                {sociedad.razon_social || sociedad.rfc}
              </MenuItem>
            ))}
          </Select>
        </FormControl>
      </Stack>

      <TableContainer>
          <Table size="small">
            <TableHead>
              <TableRow>
                <TableCell>Correo</TableCell>
                <TableCell>Expediente</TableCell>
                <TableCell>Emitido</TableCell>
                <TableCell>Expira</TableCell>
                <TableCell>Usos</TableCell>
                <TableCell>Estado</TableCell>
                <TableCell align="right">Acciones</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {loading ? (
                <TableRow>
                  <TableCell colSpan={7} align="center" sx={{ py: 4 }}>
                    <CircularProgress size={24} />
                  </TableCell>
                </TableRow>
              ) : ticketsVisibles.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={7} align="center" sx={{ py: 4 }}>
                    <Typography variant="body2" color="text.secondary">
                      Sin tickets generados todavía.
                    </Typography>
                  </TableCell>
                </TableRow>
              ) : (
                ticketsVisibles.map((ticket) => {
                  const estado = estadoDe(ticket);
                  return (
                    <TableRow key={ticket.id_pld_ticket} hover>
                      <TableCell>{ticket.email}</TableCell>
                      <TableCell>{expedienteNombre(ticket.kyc)}</TableCell>
                      <TableCell>{new Date(ticket.issued_at).toLocaleString("es-MX")}</TableCell>
                      <TableCell>{new Date(ticket.expires_at).toLocaleString("es-MX")}</TableCell>
                      <TableCell>
                        {ticket.uses_count}/{ticket.max_uses}
                      </TableCell>
                      <TableCell>
                        <Chip size="small" label={estado.label} color={estado.color} />
                      </TableCell>
                      <TableCell align="right">
                        {estado.label === "Activo" && (
                          <Button
                            size="small"
                            variant="outlined"
                            color="error"
                            onClick={() => handleRevocar(ticket.id_pld_ticket)}
                            disabled={!puedeEditar}
                          >
                            Revocar
                          </Button>
                        )}
                      </TableCell>
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
