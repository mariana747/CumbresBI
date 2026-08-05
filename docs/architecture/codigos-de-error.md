# Códigos de error del frontend

Referencia rápida de los códigos que puede mostrar el frontend cuando algo
falla. Implementado en [`frontend/src/lib/apiError.ts`](../../frontend/src/lib/apiError.ts)
y usado por los 4 clientes de API (`iam.ts`, `audit.ts`, `pld.ts`, `docint.ts`).

**Por qué existen:** antes, un error de red le mostraba al usuario el cuerpo
crudo de la respuesta del backend (a veces un traceback de Django, siempre
en un formato que un usuario final no entiende). Ahora se traduce a un
mensaje amigable en español, y se le agrega un código corto entre
paréntesis al final — ej. *"No se encontró lo que buscabas. (IAM-404)"* —
para que el usuario pueda reportarlo tal cual lo ve, sin necesitar captura
de pantalla ni reproducir el problema a ciegas.

El detalle técnico completo (status HTTP + cuerpo de la respuesta, o el
error de red original) siempre se manda a la consola del navegador
(`console.error`) con ese mismo código como prefijo — nunca se pierde,
solo deja de mostrarse en pantalla.

## Formato del código

```
<SERVICIO>-<STATUS>
<SERVICIO>-CONEXION-<ID>
```

- **`<SERVICIO>`** — a qué microservicio le falló la petición.
- **`<STATUS>`** — el código HTTP que regresó ese servicio (404, 500, etc.),
  cuando sí hubo respuesta.
- **`CONEXION-<ID>`** — cuando **nunca hubo respuesta** (servicio caído, sin
  red, CORS bloqueado): no existe un status HTTP que mostrar, así que se usa
  un identificador corto (sello de tiempo en base36, ej. `K3F8`) solo para
  poder distinguir dos reportes de conexión entre sí al cruzarlos contra la
  consola — no es un código HTTP.

## Códigos de servicio

| Código | Servicio | Cliente frontend |
|---|---|---|
| `IAM` | `iam-service` (usuarios, roles, permisos, Magic Links) | `lib/iam.ts` |
| `AUDIT` | `audit-service` (bitácora de auditoría, confirmación de envío a Drive) | `lib/audit.ts` |
| `PLD` | `pld-service` (expedientes KYC) | `lib/pld.ts` |
| `DOCINT` | `document-intelligence-service` (Motor Documental) | `lib/docint.ts` |

Al agregar un cliente nuevo (ej. `vivienda-service`), seguir el mismo patrón:
importar `apiFetch`/`friendlyApiError` de `lib/apiError.ts` y elegir un
código corto y estable para ese servicio.

## Qué significa cada status

| Status | Mensaje mostrado | Causa típica |
|---|---|---|
| 400 | La información enviada no es válida. Revísala e intenta de nuevo. | Datos del formulario no pasan validación en el backend. |
| 401 | Tu sesión no es válida. Vuelve a iniciar sesión. | Sin sesión real todavía (Fase 1) — hoy no debería aparecer en la práctica. |
| 403 | No tienes permiso para hacer esta acción. | Sin permisos reales todavía (Fase 1) — hoy no debería aparecer en la práctica. |
| 404 | No se encontró lo que buscabas. | El registro (usuario, rol, expediente, etc.) no existe o ya se borró. |
| 409 | Ya existe un registro con esos datos. | Conflicto de unicidad (ej. un permiso duplicado). |
| 429 | Se hicieron demasiadas solicitudes. Espera un momento e intenta de nuevo. | Límite de tasa — no implementado en ningún servicio todavía, reservado. |
| 5xx | Hubo un problema en el servidor. Intenta de nuevo en un momento. | Error interno del backend (ver logs del contenedor del servicio). |
| `CONEXION` | No se pudo conectar con el servidor. Verifica tu conexión e intenta de nuevo. | El contenedor del servicio no está corriendo, o problema de red/CORS. |

**Excepción:** si el backend ya manda un `detail` legible en español (ej.
`"Token inválido."`, `"Token revocado."` en `iam/views.py`), se muestra ese
texto en vez del genérico de la tabla — el código de referencia se agrega
igual al final.

## Cómo diagnosticar un código reportado

1. **`<SERVICIO>-CONEXION-<ID>`** → ese contenedor no está corriendo o no es
   alcanzable. Verificar con `docker compose ps` y `docker compose up -d
   <servicio>` si falta.
2. **`<SERVICIO>-4xx`** → revisar qué mandó el frontend (Network tab del
   navegador) contra lo que el endpoint espera en `views.py`/`serializers.py`
   del servicio correspondiente.
3. **`<SERVICIO>-5xx`** → `docker logs <servicio>-1` — el traceback completo
   de Django está ahí, aunque el usuario nunca lo vea.
4. La consola del navegador (`F12` → Console) siempre tiene el mismo código
   como prefijo (`[IAM-404] ...`) junto con el cuerpo crudo de la respuesta
   o el error de red original — es el primer lugar a revisar antes de ir a
   los logs del backend.
