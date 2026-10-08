"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Alert, Box, Chip, CircularProgress, Paper, Stack, Typography } from "@mui/material";
import { BarChart3, Building2, ClipboardList, FileSearch, ScrollText, ShieldCheck, ShoppingCart, UserPlus, UserRound, Users } from "lucide-react";
import AppShell from "@/components/AppShell";
import { Footer } from "@/components/Footer";
import { PublicNavbar } from "@/components/PublicNavbar";
import { BRAND } from "@/theme/theme";
import { SessionUser, getSession, puedeAdministrarIam, puedeVerBitacora, tieneAccesoPld, startGoogleLogin } from "@/lib/auth";
import { IamInvitation, IamUser, listInvitations, listSociedades, listUsers } from "@/lib/iam";
import { PldContraparteKyc, listKyc } from "@/lib/pld";
import { BitacoraEvento, friendlyActionName, listBitacora } from "@/lib/audit";
import { Button, Container, Link } from "@mui/material";
import { LogIn } from "lucide-react";

// Panel corporativo (reemplaza el placeholder de Fase 0 - "sin modulos
// conectados todavia"). Personalizado por rol (decision de producto
// 11/Ago/2026, mismo criterio que el sidebar - ver lib/auth.ts): cada
// tarjeta solo se PIDE si el rol de la sesion tiene permiso real para
// verla, en vez de pedir todo y esconder el resultado o, peor, dejar que
// un 403 de una tarjeta (ej. Invitaciones, ahora exige iam.crear) tumbe
// el Alert de error para todo el panel aunque las demas si cargaron bien.
//
// Sin sesion: muestra la pagina publica de CumbresBI (descripcion + boton
// de login) para que Google OAuth consent screen pueda verificar el home
// page sin autenticacion.
export default function HomePage() {
  const router = useRouter();

  const [session, setSession] = useState<SessionUser | null | undefined>(undefined);
  const [sinRolUsers, setSinRolUsers] = useState<IamUser[]>([]);
  const [invitaciones, setInvitaciones] = useState<IamInvitation[]>([]);
  const [sociedadesCount, setSociedadesCount] = useState<number | null>(null);
  const [kyc, setKyc] = useState<PldContraparteKyc[]>([]);
  const [bitacora, setBitacora] = useState<BitacoraEvento[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    getSession().then((s) => {
      setSession(s ?? null);

      const puedeIam = puedeAdministrarIam(s);
      const puedePld = tieneAccesoPld(s);

      const pendientes: Promise<unknown>[] = [
        // Sociedades es catalogo abierto (sin gate de permiso) - siempre
        // se pide, a diferencia del resto que depende del rol.
        listSociedades().then((sociedades) => setSociedadesCount(sociedades.length)),
      ];
      if (puedeIam) {
        pendientes.push(
          listUsers({ sinRol: true }).then(setSinRolUsers),
          listInvitations().then(setInvitaciones)
        );
      }
      if (puedePld) {
        pendientes.push(listKyc().then(setKyc));
      }

      Promise.all(pendientes)
        .catch((err) => setError(err instanceof Error ? err.message : "Error desconocido"))
        .finally(() => setLoading(false));

      // Bitacora: gate por role_keys, no por perm_keys (ver
      // puedeVerBitacora) - se pide directo sin condicion previa
      // adicional, y su error se traga en silencio (audit-service ya
      // regresa 200 con lista vacia para quien no califica, no 403 -
      // pero por si acaso, igual no tiene sentido mostrarle un Alert a
      // quien no tiene el permiso).
      if (puedeVerBitacora(s)) {
        listBitacora()
          .then((eventos) => setBitacora(eventos.slice(0, 5)))
          .catch(() => setBitacora(null));
      }
    });
  }, []);

  // Mientras se resuelve la sesion, no renderizar nada para evitar flash.
  if (session === undefined) return null;

  // Sin sesion: pagina publica (about + boton de login).
  if (session === null) return <PublicHomePage />;

  const puedeIam = puedeAdministrarIam(session);
  const puedePld = tieneAccesoPld(session);
  const invitacionesPendientes = invitaciones.filter((i) => !i.accepted_at && !i.revoked_at);
  const kycPorEstado = kyc.reduce<Record<string, number>>((acc, k) => {
    acc[k.estado_llenado] = (acc[k.estado_llenado] ?? 0) + 1;
    return acc;
  }, {});

  return (
    <AppShell>
      <Typography variant="h5" gutterBottom>
        Panel corporativo
      </Typography>
      <Typography variant="body2" color="text.secondary" sx={{ mb: 3 }}>
        Vista rápida de lo que necesita atención en CumbresBI.
      </Typography>

      {error && (
        <Alert severity="error" sx={{ mb: 2 }}>
          {error}
        </Alert>
      )}

      {loading ? (
        <Box sx={{ display: "flex", justifyContent: "center", py: 6 }}>
          <CircularProgress />
        </Box>
      ) : (
        <Box
          sx={{
            display: "grid",
            gridTemplateColumns: { xs: "1fr", sm: "1fr 1fr", md: "repeat(4, 1fr)" },
            gap: 2,
            mb: 3,
          }}
        >
          {puedeIam && (
            <StatCard
              icon={<UserRound size={20} strokeWidth={1.5} color={BRAND.azul} />}
              label="Usuarios sin rol asignado"
              value={sinRolUsers.length}
              onClick={() => router.push("/admin/usuarios?sinRol=true")}
            />
          )}
          {puedeIam && (
            <StatCard
              icon={<UserPlus size={20} strokeWidth={1.5} color={BRAND.azul} />}
              label="Invitaciones pendientes"
              value={invitacionesPendientes.length}
              onClick={() => router.push("/admin/invitaciones")}
            />
          )}
          <StatCard
            icon={<Building2 size={20} strokeWidth={1.5} color={BRAND.azul} />}
            label="Sociedades registradas"
            value={sociedadesCount ?? 0}
            // El conteo es visible para todos (catalogo abierto, sin gate
            // de permiso), pero SOLO navega al CRUD real (/admin/organizacion,
            // vive bajo Admin(IAM)) si el rol puede administrar IAM - antes
            // cualquiera podia entrar ahi desde el panel sin tener el
            // apartado en el sidebar (hallazgo 11/Ago/2026).
            onClick={puedeIam ? () => router.push("/admin/organizacion") : undefined}
          />
          {puedePld && (
            <StatCard
              icon={<FileSearch size={20} strokeWidth={1.5} color={BRAND.azul} />}
              label="Expedientes"
              value={kyc.length}
              onClick={() => router.push("/pld")}
            />
          )}
        </Box>
      )}

      {!loading && puedePld && kyc.length > 0 && (
        <Paper variant="outlined" sx={{ p: 3, mb: 3 }}>
          <Typography variant="subtitle1" fontWeight={600} gutterBottom>
            Expedientes por Estado
          </Typography>
          <Stack direction="row" spacing={1} sx={{ flexWrap: "wrap", gap: 1 }}>
            {Object.entries(kycPorEstado).map(([estado, count]) => (
              <Chip key={estado} label={`${friendlyEstadoKyc(estado)}: ${count}`} size="small" />
            ))}
          </Stack>
        </Paper>
      )}

      {bitacora && bitacora.length > 0 && (
        <Paper variant="outlined" sx={{ p: 3 }}>
          <Stack direction="row" alignItems="center" spacing={1} sx={{ mb: 2 }}>
            <ScrollText size={18} strokeWidth={1.5} color={BRAND.azul} />
            <Typography variant="subtitle1" fontWeight={600}>
              Bitácora Reciente
            </Typography>
          </Stack>
          <Stack spacing={1.5} divider={<Box sx={{ borderBottom: "1px solid", borderColor: "divider" }} />}>
            {bitacora.map((evento) => (
              <Stack key={evento.event_id} direction="row" justifyContent="space-between" spacing={2}>
                <Typography variant="body2">{friendlyActionName(evento.accion)}</Typography>
                <Typography variant="caption" color="text.secondary" sx={{ whiteSpace: "nowrap" }}>
                  {new Date(evento.ocurrido_en).toLocaleString("es-MX")}
                </Typography>
              </Stack>
            ))}
          </Stack>
        </Paper>
      )}
    </AppShell>
  );
}

function PublicHomePage() {
  const modulos = [
    {
      icon: <BarChart3 size={22} strokeWidth={1.5} />,
      titulo: "Tesorería",
      descripcion:
        "Gestión de flujos de efectivo, facturas, conciliación bancaria, nóminas y reportes financieros diarios.",
    },
    {
      icon: <Building2 size={22} strokeWidth={1.5} />,
      titulo: "Obra y Materiales",
      descripcion:
        "Control de avance de obra, cortes semanales, catálogo de conceptos, requisiciones y recepciones de material.",
    },
    {
      icon: <ShoppingCart size={22} strokeWidth={1.5} />,
      titulo: "Compras",
      descripcion:
        "Solicitudes de compra, cotizaciones, órdenes de compra y recepción de mercancía.",
    },
    {
      icon: <Users size={22} strokeWidth={1.5} />,
      titulo: "Recursos Humanos",
      descripcion:
        "Gestión de empleados, puestos, historial de sueldos y portal de autoservicio para colaboradores.",
    },
    {
      icon: <ShieldCheck size={22} strokeWidth={1.5} />,
      titulo: "PLD (Prevención de Lavado de Dinero)",
      descripcion:
        "Expedientes KYC/KYB de clientes y proveedores, motor documental, bitácora de cumplimiento regulatorio.",
    },
    {
      icon: <ClipboardList size={22} strokeWidth={1.5} />,
      titulo: "Tickets y Proyectos",
      descripcion:
        "Seguimiento de proyectos internos, subproyectos, dependencias y log de actividad.",
    },
  ];

  return (
    <Box sx={{ display: "flex", flexDirection: "column", minHeight: "100vh", bgcolor: "background.default" }}>
      <PublicNavbar />

      {/* Hero */}
      <Box sx={{ bgcolor: "background.paper", borderBottom: "1px solid", borderColor: "divider" }}>
        <Container maxWidth="md" sx={{ py: { xs: 6, md: 8 }, textAlign: "center" }}>
          <Typography variant="h4" fontWeight={700} gutterBottom>
            CumbresBI
          </Typography>
          <Typography variant="h6" fontWeight={400} color="text.secondary" gutterBottom>
            Plataforma de Gestión Empresarial Interna
          </Typography>
          <Typography variant="body1" color="text.secondary" sx={{ maxWidth: 640, mx: "auto", mb: 4 }}>
            Plataforma digital interna desarrollada por{" "}
            <strong>Consultoría y Proyectos Cumbres S.A. de C.V.</strong> y sus sociedades
            relacionadas (Tizara y Tizara Capital) para la operación y gestión integral de sus
            áreas corporativas.
          </Typography>
          <Button
            variant="contained"
            size="large"
            startIcon={<LogIn size={18} strokeWidth={1.5} />}
            onClick={() => startGoogleLogin()}
          >
            Iniciar sesión con Google
          </Button>
        </Container>
      </Box>

      <Container maxWidth="md" sx={{ flex: 1, py: { xs: 5, md: 7 } }}>
        <Stack spacing={5}>

          <Paper elevation={0} sx={{ p: { xs: 3, md: 4 }, borderRadius: 3, boxShadow: "0 1px 4px rgba(0,0,0,0.06)" }}>
            <Typography variant="h6" fontWeight={600} gutterBottom>
              ¿Para qué sirve CumbresBI?
            </Typography>
            <Typography variant="body1" color="text.secondary">
              CumbresBI centraliza la operación financiera, de obra, compras, recursos humanos y
              cumplimiento regulatorio en una sola plataforma interna. Su uso está restringido
              exclusivamente a colaboradores y personal autorizado de la organización.
            </Typography>
          </Paper>

          <Box>
            <Typography variant="h6" fontWeight={600} sx={{ mb: 2.5 }}>
              Módulos principales
            </Typography>
            <Box sx={{ display: "grid", gridTemplateColumns: { xs: "1fr", sm: "1fr 1fr" }, gap: 2 }}>
              {modulos.map((m) => (
                <Paper
                  key={m.titulo}
                  elevation={0}
                  sx={{
                    p: 3,
                    borderRadius: 3,
                    boxShadow: "0 1px 4px rgba(0,0,0,0.06)",
                    transition: "box-shadow 0.2s",
                    "&:hover": { boxShadow: "0 4px 12px rgba(0,0,0,0.10)" },
                  }}
                >
                  <Stack direction="row" spacing={2} alignItems="flex-start">
                    <Box
                      sx={{
                        color: "primary.main",
                        bgcolor: (t) => `${t.palette.primary.main}18`,
                        borderRadius: 2,
                        p: 1,
                        flexShrink: 0,
                        display: "flex",
                      }}
                    >
                      {m.icon}
                    </Box>
                    <Box>
                      <Typography variant="subtitle2" fontWeight={600}>
                        {m.titulo}
                      </Typography>
                      <Typography variant="body2" color="text.secondary" sx={{ mt: 0.5 }}>
                        {m.descripcion}
                      </Typography>
                    </Box>
                  </Stack>
                </Paper>
              ))}
            </Box>
          </Box>

          <Paper elevation={0} sx={{ p: { xs: 3, md: 4 }, borderRadius: 3, boxShadow: "0 1px 4px rgba(0,0,0,0.06)" }}>
            <Typography variant="h6" fontWeight={600} gutterBottom>
              Integración con Google
            </Typography>
            <Typography variant="body1" color="text.secondary">
              CumbresBI utiliza las APIs de Google (Google Sheets y Google Drive) exclusivamente
              para permitir a los usuarios autorizados exportar reportes financieros a su propio
              Google Drive. Esta funcionalidad requiere autorización explícita del usuario vía
              OAuth y no concede acceso a ningún archivo preexistente en su cuenta. El uso de datos
              de Google se adhiere a la <em>Google API Services User Data Policy</em> y a los
              requisitos de uso limitado (<em>Limited Use</em>).
            </Typography>
          </Paper>

          <Paper elevation={0} sx={{ p: { xs: 3, md: 4 }, borderRadius: 3, boxShadow: "0 1px 4px rgba(0,0,0,0.06)" }}>
            <Typography variant="h6" fontWeight={600} gutterBottom>
              Contacto y documentos legales
            </Typography>
            <Stack spacing={1.5}>
              <Typography variant="body2" color="text.secondary">
                Para dudas sobre el uso de la plataforma o el tratamiento de datos personales:
              </Typography>
              <Link href="mailto:desarrollo@cypcumbres.com" underline="hover" variant="body2">
                desarrollo@cypcumbres.com
              </Link>
              <Stack direction="row" spacing={2} flexWrap="wrap" sx={{ pt: 0.5 }}>
                <Button variant="outlined" size="small" href="/privacidad">
                  Política de Privacidad
                </Button>
                <Button variant="outlined" size="small" href="/terminos">
                  Términos y Condiciones
                </Button>
              </Stack>
            </Stack>
          </Paper>

        </Stack>
      </Container>

      <Footer />
    </Box>
  );
}

function friendlyEstadoKyc(estado: string): string {
  const labels: Record<string, string> = {
    PENDIENTE: "Pendiente",
    INCOMPLETO: "Incompleto",
    ENTREGADO: "Entregado",
  };
  return labels[estado] ?? estado;
}

function StatCard({
  icon,
  label,
  value,
  onClick,
}: {
  icon: React.ReactNode;
  label: string;
  value: number;
  onClick?: () => void;
}) {
  return (
    <Paper
      variant="outlined"
      onClick={onClick}
      sx={{
        p: 2.5,
        cursor: onClick ? "pointer" : "default",
        transition: "border-color 0.15s",
        ...(onClick && { "&:hover": { borderColor: "primary.main" } }),
      }}
    >
      <Stack direction="row" spacing={1.5} alignItems="center" sx={{ mb: 1 }}>
        {icon}
        <Typography variant="body2" color="text.secondary">
          {label}
        </Typography>
      </Stack>
      <Typography variant="h4" fontWeight={700}>
        {value}
      </Typography>
    </Paper>
  );
}
