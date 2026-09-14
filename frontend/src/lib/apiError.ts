// Traduce una respuesta HTTP fallida a un mensaje amigable para el usuario
// final - antes, cada cliente (iam.ts, audit.ts, pld.ts) lanzaba el cuerpo
// crudo de la respuesta (a veces un traceback de Django) directo a la
// pantalla via setError(err.message). El detalle tecnico completo se
// conserva en la consola del navegador para depuracion, nunca se pierde -
// solo deja de mostrarse en pantalla.
//
// Codigo de referencia (ej. "IAM-500"): se agrega al final del mensaje para
// que un usuario pueda reportar el error tal cual lo ve ("me salio
// IAM-500") y quien lo revise lo cruce directo contra los logs del
// servicio + status, sin tener que pedirle screenshots ni reproducir el
// problema a ciegas.
const MENSAJES_POR_STATUS: Record<number, string> = {
  400: "La información enviada no es válida. Revísala e intenta de nuevo.",
  401: "Tu sesión no es válida. Vuelve a iniciar sesión.",
  403: "No tienes permiso para hacer esta acción.",
  404: "No se encontró lo que buscabas.",
  409: "Ya existe un registro con esos datos.",
  429: "Se hicieron demasiadas solicitudes. Espera un momento e intenta de nuevo.",
};

function mensajePorStatus(status: number): string {
  if (MENSAJES_POR_STATUS[status]) return MENSAJES_POR_STATUS[status];
  if (status >= 500) return "Hubo un problema en el servidor. Intenta de nuevo en un momento.";
  return "Ocurrió un error inesperado. Intenta de nuevo.";
}

// Si el backend ya manda un "detail" en espanol legible (ej. {"detail":
// "Token invalido."} en iam/views.py) se usa tal cual - ya es amigable,
// solo lo escribio un humano en el codigo. Si no, cae al mensaje generico
// por status. Errores de validacion por campo (ej. {"email": ["..."]})
// tambien intentan mostrarse legibles en vez de mostrar el JSON crudo.
//
// serviceCode: abreviacion corta y estable para el codigo de referencia -
// "IAM", "AUDIT", "PLD", etc. (no el nombre completo del servicio, para que
// el codigo quede corto y facil de dictar/copiar).
export async function friendlyApiError(serviceCode: string, response: Response): Promise<Error> {
  const body = await response.text();
  const codigo = `${serviceCode}-${response.status}`;
  // eslint-disable-next-line no-console
  console.error(`[${codigo}]`, body);

  let detail: string | undefined;
  try {
    const parsed = JSON.parse(body);
    if (typeof parsed?.detail === "string") {
      detail = parsed.detail;
    } else if (parsed && typeof parsed === "object") {
      const primerCampo = Object.values(parsed)[0];
      if (Array.isArray(primerCampo) && typeof primerCampo[0] === "string") {
        detail = primerCampo[0];
      }
    }
  } catch {
    // body no era JSON (ej. traceback HTML de Django con DEBUG=True) - se
    // ignora, cae al mensaje generico por status.
  }

  return new Error(`${detail ?? mensajePorStatus(response.status)} (${codigo})`);
}

// Envuelve fetch() para atrapar tambien el caso en el que nunca hubo
// respuesta (servicio caido, sin red, CORS bloqueado) - ese es un
// TypeError que el navegador lanza como "Failed to fetch"/"NetworkError",
// ANTES de llegar a la validacion de response.ok de arriba. Sin esto, ese
// caso se le mostraba crudo al usuario tal cual lo escribe el navegador -
// en ingles, sin contexto de que fue lo que fallo.
//
// Este caso no tiene status HTTP (nunca hubo respuesta) - el "numero" que
// pide el usuario aqui no puede ser un status como en friendlyApiError, asi
// que se usa un sello de tiempo corto (base36, ultimos 4 caracteres) solo
// para poder distinguir dos reportes de "CONEXION" entre si al cruzarlos
// contra la consola - no es un codigo HTTP, es un identificador de ocurrencia.
export async function apiFetch(serviceCode: string, url: string, init?: RequestInit): Promise<Response> {
  try {
    // credentials:"include" por default en TODAS las llamadas a los
    // microservicios - es como viaja la cookie de sesion real
    // (cumbresbi_session, puesta por iam-service) hacia cualquier servicio
    // en localhost, sin importar el puerto (ver cumbresbi_scope.middleware,
    // fallback de cookie). Un caller puede sobreescribirlo pasando su propio
    // "credentials" en init.
    return await fetch(url, { credentials: "include", ...init });
  } catch (err) {
    const idOcurrencia = Date.now().toString(36).slice(-4).toUpperCase();
    const codigo = `${serviceCode}-CONEXION-${idOcurrencia}`;
    // eslint-disable-next-line no-console
    console.error(`[${codigo}]`, url, err);
    throw new Error(`No se pudo conectar con el servidor. Verifica tu conexión e intenta de nuevo. (${codigo})`);
  }
}
