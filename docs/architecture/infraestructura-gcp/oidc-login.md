# OIDC / login

- [ ] Mariana necesita que le otorguen el rol `roles/serviceusage.apiKeysAdmin` (o al menos
      `apiKeysViewer`) para poder entrar a **APIs y servicios → Credenciales**
- [ ] Confirmar si las credenciales OIDC (Client ID/Secret) ya se crearon o quedaron a medias
- [ ] Configurar el Client ID de OAuth restringido al dominio de Workspace de Cumbres (no abierto a
      cualquier cuenta de Google) — el login y el guardado en Drive deben usar la cuenta de Workspace
      de la empresa, no cuentas personales
      (rama `feature/docint-cloud-sql-socket-v2-oidc-login`)

## Drive (relacionado, en pausa)

- [ ] En pausa — no urgente hasta Fase 2
