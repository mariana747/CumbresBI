import base64
import datetime
import logging

import requests
from cumbresbi_scope import forward_auth_headers
from django.conf import settings
from django.utils.html import escape

logger = logging.getLogger(__name__)

_TIMEOUT_SEGUNDOS = 10
_TIMEOUT_DESCARGA_ADJUNTO_SEGUNDOS = 20
# Envios con adjuntos tardan mas que el resto de las llamadas a mail-service
# (sube el PDF/XML ya codificados) - timeout mas holgado solo para esa
# llamada, ver enviar_factura.
_TIMEOUT_ENVIO_CON_ADJUNTOS_SEGUNDOS = 30
_TAMANO_MAXIMO_ADJUNTO_BYTES = 15 * 1024 * 1024  # limite practico de Gmail (25MB) con margen

# Mismos tokens de marca que pld-service/pld/mail_utils.py e iam-service/
# iam/mail_utils.py - duplicado a proposito, ver docstring de esos archivos
# (los correos van por Gmail API, no por Next.js, y los clientes de correo
# ignoran <style>, todo va inline).
_AZUL = "#1C75BC"
_CHARCOAL = "#343741"
_VERDE = "#1E7A34"
_ROJO = "#B3261E"
_INK_MUTED = "#6B7280"


def _renderizar_correo(
    *, kicker_texto: str, kicker_bg: str, kicker_color: str, titulo: str, cuerpo_html: str,
    cta_texto: str, cta_url: str, fineprint_texto: str,
) -> str:
    """Mismo molde que pld-service/pld/mail_utils.py::_renderizar_correo
    (diseño aprobado por Mariana 14/Ago/2026) - duplicado a proposito, ver
    comentario de _AZUL/_CHARCOAL arriba. Usado por
    enviar_correo_ticket_proveedor (27/Ago/2026)."""
    return f"""
<div style="background:#F1F3F5;padding:32px 16px;font-family:'DM Sans',Arial,sans-serif;">
  <div style="max-width:480px;margin:0 auto;background:#FFFFFF;border-radius:12px;
              border:1px solid #E1E4E9;padding:36px 34px 30px;">
    <div style="font-size:15px;font-weight:800;letter-spacing:-0.01em;color:{_CHARCOAL};
                margin-bottom:24px;">
      <span style="display:inline-block;width:22px;height:22px;border-radius:6px;
                    background:{_AZUL};color:#fff;font-size:12px;font-weight:800;
                    text-align:center;line-height:22px;margin-right:8px;">C</span>CumbresBI
    </div>
    <span style="display:inline-block;font-size:11px;font-weight:700;letter-spacing:0.06em;
                  text-transform:uppercase;padding:4px 10px;border-radius:100px;
                  background:{kicker_bg};color:{kicker_color};margin-bottom:14px;">
      {escape(kicker_texto)}
    </span>
    <h1 style="font-size:20px;font-weight:700;color:#23252B;margin:0 0 14px;
               letter-spacing:-0.01em;">{escape(titulo)}</h1>
    <div style="color:#4B4F58;font-size:14.5px;line-height:1.65;margin:0 0 20px;">
      {cuerpo_html}
    </div>
    <a href="{cta_url}" style="display:inline-block;background:{_AZUL};color:#ffffff;
       text-decoration:none;font-weight:700;font-size:14px;padding:12px 22px;
       border-radius:7px;margin:0 0 22px;">{escape(cta_texto)}</a>
    <div style="font-size:12.5px;color:{_INK_MUTED};background:#F7F7F8;border-radius:7px;
                padding:10px 12px;">
      {escape(fineprint_texto)}
    </div>
    <div style="margin-top:26px;padding-top:16px;border-top:1px solid #EEEFF1;
                font-size:11.5px;color:#9BA0AB;">
      Consultoría y Proyectos Cumbres · este correo se generó automáticamente, no respondas a él.
    </div>
  </div>
</div>
""".strip()


def _texto_pct(valor) -> str:
    return f"{valor:,.1f}%" if valor is not None else "—"


_DIAS_SEMANA_ES = ["lunes", "martes", "miércoles", "jueves", "viernes", "sábado", "domingo"]
_MESES_ES = [
    "enero", "febrero", "marzo", "abril", "mayo", "junio",
    "julio", "agosto", "septiembre", "octubre", "noviembre", "diciembre",
]


def _fecha_larga_es(valor) -> str:
    """"día de la semana, día de mes de año" (11/Sep/2026, mismo formato
    que "Generado al" en el reporte legado de Wall-E Homes: "martes, 21 de
    mayo de 2024"). `valor` llega como str (YYYY-MM-DD) o como date segun
    el corte (ver calcular_reporte_diario en reportes.py)."""
    fecha = valor if isinstance(valor, datetime.date) else datetime.date.fromisoformat(valor)
    return f"{_DIAS_SEMANA_ES[fecha.weekday()]}, {fecha.day} de {_MESES_ES[fecha.month - 1]} de {fecha.year}"


# Colores de fondo por empresa (11/Sep/2026, "en colores azules") - todos
# en tonos de azul (variando la intensidad), en vez de la paleta multicolor
# original; rotan si hay mas empresas que colores.
_COLORES_EMPRESA = ["#DCEBF7", "#C7E0F4", "#B3D5F0", "#9FC9EC"]


def _fila_empresa_html(nombre_empresa: str, color: str) -> str:
    return f"""
    <tr style="background:{color};">
      <td colspan="5" style="padding:6px 10px;font-weight:700;color:{_CHARCOAL};">{escape(nombre_empresa)}</td>
    </tr>"""


def _chip_tipo_movimiento_html(monto) -> str:
    """Tipo del movimiento con color (11/Sep/2026, "los tipos con colores")
    - EGRESO en rojo, INGRESO en verde, igual que el resto del reporte
    pinta positivo/negativo."""
    if monto is not None and monto < 0:
        return f'<span style="display:inline-block;padding:1px 8px;border-radius:100px;font-size:10.5px;font-weight:700;background:#FBE7E5;color:{_ROJO};">EGRESO</span>'
    return f'<span style="display:inline-block;padding:1px 8px;border-radius:100px;font-size:10.5px;font-weight:700;background:#E4F3E8;color:{_VERDE};">INGRESO</span>'


def _fila_cuenta_html(numero: int, fila: dict) -> str:
    cambio_texto = f"{fila['cambio']:,.2f}" if fila["cambio"] is not None else "—"
    # cambio_pct (11/Sep/2026, formato del reporte legado de Wall-E Homes) -
    # el backend manda None sin base contra que comparar.
    cambio_pct_texto = _texto_pct(fila.get("cambio_pct"))
    saldo_texto = f"{fila['saldo_hoy']:,.2f}" if fila["saldo_hoy"] is not None else "Sin saldo capturado"
    # numero (11/Sep/2026, "la numeracion de cuentas" del reporte legado:
    # "(1) INBUR 3585", "(2) AMEX 2004"...) - continua a lo largo de TODO
    # el corte, no se reinicia por empresa.
    filas_html = f"""
    <tr>
      <td style="padding:10px;border-bottom:1px solid #EEEFF1;">({numero}) {escape(fila['alias'])}</td>
      <td style="padding:10px;border-bottom:1px solid #EEEFF1;text-align:right;">{saldo_texto}</td>
      <td style="padding:10px;border-bottom:1px solid #EEEFF1;text-align:right;">{cambio_texto}</td>
      <td style="padding:10px;border-bottom:1px solid #EEEFF1;text-align:right;">{cambio_pct_texto}</td>
      <td style="padding:10px;border-bottom:1px solid #EEEFF1;"></td>
    </tr>"""
    # Desglose de transacciones (11/Sep/2026, formato legado: cada
    # movimiento del dia sale como su propia fila indentada, con su
    # comentario libre - descripcion_pago) - solo si hubo alguna.
    for t in fila["transacciones"]:
        monto = t["total_mxp"]
        monto_texto = f"{monto:,.2f}" if monto is not None else "—"
        color_monto = _ROJO if monto is not None and monto < 0 else _VERDE
        filas_html += f"""
    <tr>
      <td style="padding:4px 10px 4px 24px;border-bottom:1px solid #EEEFF1;color:{_INK_MUTED};font-size:12px;">{escape(t['concepto'] or t['id_flujo'])}</td>
      <td style="padding:4px 10px;border-bottom:1px solid #EEEFF1;"></td>
      <td style="padding:4px 10px;border-bottom:1px solid #EEEFF1;text-align:right;font-size:12px;color:{color_monto};font-weight:600;">{monto_texto}</td>
      <td style="padding:4px 10px;border-bottom:1px solid #EEEFF1;">{_chip_tipo_movimiento_html(monto)}</td>
      <td style="padding:4px 10px;border-bottom:1px solid #EEEFF1;font-size:12px;color:{_INK_MUTED};">{escape(t['descripcion_pago'] or '')}</td>
    </tr>"""
    # "Otros cargos/abonos" (11/Sep/2026, formato legado) - lo que el
    # cambio de saldo no explica ninguna transaccion capturada; en rojo si
    # no cuadra, igual que la diferencia se pintaba antes.
    if fila["diferencia"] not in (None, 0):
        color_diferencia = _ROJO if not fila["cuadra"] else _VERDE
        filas_html += f"""
    <tr>
      <td style="padding:4px 10px 4px 24px;border-bottom:1px solid #EEEFF1;color:{_INK_MUTED};font-size:12px;">Otros cargos/abonos</td>
      <td style="padding:4px 10px;border-bottom:1px solid #EEEFF1;"></td>
      <td style="padding:4px 10px;border-bottom:1px solid #EEEFF1;text-align:right;font-size:12px;color:{color_diferencia};font-weight:700;">{fila['diferencia']:,.2f}</td>
      <td style="padding:4px 10px;border-bottom:1px solid #EEEFF1;"></td>
      <td style="padding:4px 10px;border-bottom:1px solid #EEEFF1;"></td>
    </tr>"""
    return filas_html


def _tabla_corte_html(corte: dict) -> str:
    """Una tabla de saldos por empresa/cuenta (con su desglose de
    transacciones y "Otros cargos/abonos") + el consolidado, para un solo
    corte (dia anterior u hoy) - calcada del reporte legado de Wall-E
    Homes ("Resumen de saldos al día...", empresa como fila de color,
    cuentas indentadas debajo) - ver _renderizar_reporte."""
    numero = 0
    filas_html = ""
    for i, empresa in enumerate(corte["sociedades"]):
        filas_html += _fila_empresa_html(empresa["sociedad"] or "Sin empresa", _COLORES_EMPRESA[i % len(_COLORES_EMPRESA)])
        for fila in empresa["cuentas"]:
            numero += 1
            filas_html += _fila_cuenta_html(numero, fila)

    consolidado = corte["consolidado"]
    saldo_hoy_texto = (
        f"{consolidado['saldo_hoy_total']:,.2f}" if consolidado["saldo_hoy_total"] is not None else "—"
    )
    cambio_neto_texto = (
        f"{consolidado['cambio_neto']:,.2f}" if consolidado["cambio_neto"] is not None else "—"
    )
    cambio_neto_pct_texto = _texto_pct(consolidado.get("cambio_neto_pct"))
    return f"""
    <div style="font-size:13.5px;font-weight:700;color:{_CHARCOAL};margin:28px 0 10px;">
      Resumen de saldos al día: {corte['fecha']}
    </div>
    <table style="width:100%;border-collapse:collapse;font-size:13px;color:#4B4F58;">
      <thead>
        <tr style="text-align:left;">
          <th style="padding:10px;border-bottom:2px solid #E1E4E9;">Cuenta</th>
          <th style="padding:10px;border-bottom:2px solid #E1E4E9;text-align:right;">Saldo al día</th>
          <th style="padding:10px;border-bottom:2px solid #E1E4E9;text-align:right;">Cambio ($)</th>
          <th style="padding:10px;border-bottom:2px solid #E1E4E9;text-align:right;">Cambio (%)</th>
          <th style="padding:10px;border-bottom:2px solid #E1E4E9;">Comentarios</th>
        </tr>
      </thead>
      <tbody>{filas_html}</tbody>
      <tfoot>
        <tr style="background:#F7F7F8;font-weight:700;color:#23252B;">
          <td style="padding:10px;border-top:2px solid #E1E4E9;">Saldo total al: {corte['fecha']}</td>
          <td style="padding:10px;border-top:2px solid #E1E4E9;text-align:right;">{saldo_hoy_texto}</td>
          <td style="padding:10px;border-top:2px solid #E1E4E9;text-align:right;">{cambio_neto_texto}</td>
          <td style="padding:10px;border-top:2px solid #E1E4E9;text-align:right;">{cambio_neto_pct_texto}</td>
          <td style="padding:10px;border-top:2px solid #E1E4E9;"></td>
        </tr>
      </tfoot>
    </table>"""


def _renderizar_reporte(reporte: dict) -> str:
    """Dos cortes (11/Sep/2026, redisenio sobre el formato legado de Wall-E
    Homes - documento "20240521_GWE_DFPE_DT_Registro diario de saldos
    vencidos - Reporte de saldos": "1.1 Resumen de saldos al día anterior"
    + "1.2 Resumen de saldos al día") - el correo trae ambas tablas, no
    solo la del dia elegido, cada una agrupada por empresa (fila de color)
    con las cuentas y su desglose de transacciones debajo."""
    tabla_anterior = _tabla_corte_html(reporte["corte_anterior"])
    tabla_hoy = _tabla_corte_html(reporte)
    return f"""
<div style="background:#F1F3F5;padding:32px 16px;font-family:'DM Sans',Arial,sans-serif;">
  <div style="max-width:920px;margin:0 auto;background:#FFFFFF;border-radius:12px;
              border:1px solid #E1E4E9;padding:36px 40px 30px;">
    <div style="font-size:15px;font-weight:800;letter-spacing:-0.01em;color:{_CHARCOAL};
                margin-bottom:18px;">
      <span style="display:inline-block;width:22px;height:22px;border-radius:6px;
                    background:{_AZUL};color:#fff;font-size:12px;font-weight:800;
                    text-align:center;line-height:22px;margin-right:8px;">C</span>CumbresBI
    </div>
    <h1 style="font-size:20px;font-weight:700;color:#23252B;margin:0 0 8px;
               letter-spacing:-0.01em;">Registro diario de saldos finales en cuentas bancarias</h1>
    <div style="font-size:13px;color:{_INK_MUTED};margin:0 0 16px;">Generado al: {_fecha_larga_es(reporte['fecha'])}</div>
    {tabla_anterior}
    {tabla_hoy}
    <div style="margin-top:26px;padding-top:16px;border-top:1px solid #EEEFF1;
                font-size:11.5px;color:#9BA0AB;">
      Consultoría y Proyectos Cumbres · este correo se generó automáticamente, no respondas a él.
    </div>
  </div>
</div>
""".strip()


def _renderizar_factura(factura) -> str:
    total_texto = f"{factura.comprobante_total:,.2f}" if factura.comprobante_total is not None else "—"
    folio_texto = f"{factura.comprobante_serie or ''}{factura.comprobante_folio or factura.timbre_uuid}"
    return f"""
<div style="background:#F1F3F5;padding:32px 16px;font-family:'DM Sans',Arial,sans-serif;">
  <div style="max-width:640px;margin:0 auto;background:#FFFFFF;border-radius:12px;
              border:1px solid #E1E4E9;padding:36px 34px 30px;">
    <div style="font-size:15px;font-weight:800;letter-spacing:-0.01em;color:{_CHARCOAL};
                margin-bottom:8px;">
      <span style="display:inline-block;width:22px;height:22px;border-radius:6px;
                    background:{_AZUL};color:#fff;font-size:12px;font-weight:800;
                    text-align:center;line-height:22px;margin-right:8px;">C</span>CumbresBI
    </div>
    <h1 style="font-size:20px;font-weight:700;color:#23252B;margin:0 0 20px;
               letter-spacing:-0.01em;">Factura {escape(folio_texto)}</h1>
    <table style="width:100%;border-collapse:collapse;font-size:13px;color:#4B4F58;">
      <tbody>
        <tr><td style="padding:6px 0;">UUID</td><td style="padding:6px 0;text-align:right;">{escape(factura.timbre_uuid)}</td></tr>
        <tr><td style="padding:6px 0;">Emisor</td><td style="padding:6px 0;text-align:right;">{escape(factura.emisor_nombre or factura.emisor_rfc or "—")}</td></tr>
        <tr><td style="padding:6px 0;">Fecha</td><td style="padding:6px 0;text-align:right;">{escape(str(factura.comprobante_fecha or "—"))}</td></tr>
        <tr><td style="padding:6px 0;font-weight:700;">Total</td><td style="padding:6px 0;text-align:right;font-weight:700;">{total_texto}</td></tr>
      </tbody>
    </table>
    {"".join(f'<p style="margin-top:16px;"><a href="{escape(link)}" style="color:{_AZUL};">{etiqueta}</a></p>' for link, etiqueta in [(factura.link_pdf, "Ver PDF"), (factura.link_xml, "Ver XML")] if link)}
    <div style="margin-top:26px;padding-top:16px;border-top:1px solid #EEEFF1;
                font-size:11.5px;color:#9BA0AB;">
      Consultoría y Proyectos Cumbres · este correo se generó automáticamente, no respondas a él.
    </div>
  </div>
</div>
""".strip()


def _descargar_adjunto(url: str, nombre_archivo: str) -> dict | None:
    """Descarga un archivo desde una URL externa (link_pdf/link_xml de
    Factura - son links pegados a mano, NO drive_file_id: no hay Unidad de
    Drive propia para este flujo todavia, ver models.py::TesoreriaFactura)
    y lo regresa listo para mail-service ({"filename", "content_type",
    "data_b64"}). Regresa None si falla o si el archivo excede el tamano
    maximo - fail-open, mismo criterio que el resto de este archivo: un
    adjunto que no se pudo traer no debe tumbar el envio del correo, solo
    hace que ese correo se mande con el link en vez del archivo."""
    try:
        respuesta = requests.get(url, timeout=_TIMEOUT_DESCARGA_ADJUNTO_SEGUNDOS)
    except requests.RequestException:
        logger.warning("no se pudo descargar el adjunto %s desde %s", nombre_archivo, url, exc_info=True)
        return None
    if respuesta.status_code != 200:
        logger.warning("la URL del adjunto %s respondio %s: %s", nombre_archivo, respuesta.status_code, url)
        return None
    if len(respuesta.content) > _TAMANO_MAXIMO_ADJUNTO_BYTES:
        logger.warning("el adjunto %s excede el tamano maximo permitido, se manda solo el link", nombre_archivo)
        return None
    return {
        "filename": nombre_archivo,
        "content_type": respuesta.headers.get("Content-Type") or "application/octet-stream",
        "data_b64": base64.b64encode(respuesta.content).decode("ascii"),
    }


def _descargar_adjunto_drive(request, drive_file_id: str, nombre_archivo: str, mime_type: str | None) -> dict | None:
    """Mismo resultado que _descargar_adjunto, pero via drive-service
    autenticado en vez de una URL externa (07/Sep/2026, factura con
    drive_file_id_pdf/xml reales - ver TesoreriaFacturaViewSet.
    confirmar_extraccion/_vincular_archivo_drive). No manda `carpeta` -
    innecesaria en modo real (Drive resuelve por file_id solo, ver
    drive-service/drive/driveclient.py::iter_download), solo hace falta en
    el modo simulado de drive-service."""
    headers, cookies = forward_auth_headers(request)
    try:
        respuesta = requests.get(
            f"{settings.DRIVE_SERVICE_URL}/api/download/{drive_file_id}/",
            params={"perm": "facturacion-cfdi.editar"},
            headers=headers,
            cookies=cookies,
            timeout=_TIMEOUT_DESCARGA_ADJUNTO_SEGUNDOS,
        )
    except requests.RequestException:
        logger.warning("drive-service no respondio al descargar el adjunto %s", nombre_archivo, exc_info=True)
        return None
    if respuesta.status_code != 200:
        logger.warning("drive-service rechazo el adjunto %s: %s", nombre_archivo, respuesta.status_code)
        return None
    if len(respuesta.content) > _TAMANO_MAXIMO_ADJUNTO_BYTES:
        logger.warning("el adjunto %s excede el tamano maximo permitido, se manda solo el link", nombre_archivo)
        return None
    return {
        "filename": nombre_archivo,
        "content_type": respuesta.headers.get("Content-Type") or mime_type or "application/octet-stream",
        "data_b64": base64.b64encode(respuesta.content).decode("ascii"),
    }


def enviar_factura(request, destinatario: str, factura) -> bool:
    """Envia UNA factura por correo via mail-service - se llama una vez por
    factura seleccionada desde TesoreriaFacturaViewSet.enviar_masivo (envio
    "por separado", ver finanzas.md: "Multiple invoices can be selected to
    send massively (separately)"). No propaga la excepcion, mismo criterio
    que enviar_reporte_diario.

    07/Sep/2026: ahora intenta adjuntar el PDF/XML real en vez de solo
    poner los links en el cuerpo - preferimos drive_file_id_pdf/xml (el
    archivo real que el Motor Documental analizo, ver
    TesoreriaFacturaViewSet._vincular_archivo_drive) via drive-service
    autenticado; si no hay drive_file_id (alta manual historica con solo
    link_pdf/link_xml pegado a mano) cae a la descarga por URL externa. Si
    la descarga de alguno falla, ese archivo se manda solo como link (el
    correo de _renderizar_factura ya trae los links de respaldo), nunca se
    bloquea el envio completo por un adjunto que no se pudo traer."""
    headers, cookies = forward_auth_headers(request)
    html_body = _renderizar_factura(factura)
    folio_texto = f"{factura.comprobante_serie or ''}{factura.comprobante_folio or factura.timbre_uuid}"

    adjuntos = []
    if factura.drive_file_id_pdf:
        adjunto_pdf = _descargar_adjunto_drive(
            request, factura.drive_file_id_pdf, f"{folio_texto}.pdf", factura.mime_type_pdf
        )
    elif factura.link_pdf:
        adjunto_pdf = _descargar_adjunto(factura.link_pdf, f"{folio_texto}.pdf")
    else:
        adjunto_pdf = None
    if adjunto_pdf:
        adjuntos.append(adjunto_pdf)

    if factura.drive_file_id_xml:
        adjunto_xml = _descargar_adjunto_drive(
            request, factura.drive_file_id_xml, f"{folio_texto}.xml", factura.mime_type_xml
        )
    elif factura.link_xml:
        adjunto_xml = _descargar_adjunto(factura.link_xml, f"{folio_texto}.xml")
    else:
        adjunto_xml = None
    if adjunto_xml:
        adjuntos.append(adjunto_xml)

    try:
        respuesta = requests.post(
            f"{settings.MAIL_SERVICE_URL}/api/send/",
            params={"perm": "facturacion-cfdi.editar"},
            json={
                "to": destinatario,
                "subject": f"Factura {folio_texto}",
                "html_body": html_body,
                "adjuntos": adjuntos,
            },
            headers=headers,
            cookies=cookies,
            timeout=_TIMEOUT_ENVIO_CON_ADJUNTOS_SEGUNDOS,
        )
    except requests.RequestException:
        logger.warning("mail-service no respondio al enviar la factura %s a %s", factura.timbre_uuid, destinatario, exc_info=True)
        return False
    if respuesta.status_code != 201:
        logger.warning("mail-service rechazo la factura %s para %s: %s", factura.timbre_uuid, destinatario, respuesta.text)
        return False
    return True


def enviar_reporte_diario(request, destinatarios: list[str], reporte: dict) -> bool:
    """Envia el reporte diario de saldos por correo via mail-service (Gmail
    API) - mismo patron que pld-service/pld/mail_utils.py::enviar_correo_ticket_cliente.
    No propaga la excepcion - un fallo de envio no debe tumbar la
    generacion del reporte en si (el frontend lo sigue mostrando en
    pantalla aunque el correo falle)."""
    headers, cookies = forward_auth_headers(request)
    html_body = _renderizar_reporte(reporte)

    ok_total = True
    for destinatario in destinatarios:
        try:
            respuesta = requests.post(
                f"{settings.MAIL_SERVICE_URL}/api/send/",
                params={"perm": "tesoreria.crear"},
                json={
                    "to": destinatario,
                    "subject": f"Reporte diario de saldos — {reporte['fecha']}",
                    "html_body": html_body,
                },
                headers=headers,
                cookies=cookies,
                timeout=_TIMEOUT_SEGUNDOS,
            )
        except requests.RequestException:
            logger.warning("mail-service no respondio al enviar el reporte diario a %s", destinatario, exc_info=True)
            ok_total = False
            continue
        if respuesta.status_code != 201:
            logger.warning("mail-service rechazo el reporte diario para %s: %s", destinatario, respuesta.text)
            ok_total = False
    return ok_total


def enviar_correo_documento_faltante(
    request, email: str, id_contrato: str, nombre_documento: str, token: str
) -> bool:
    """Avisa que falta UN documento del checklist de un contrato, con un
    magic link para que el CLIENTE lo suba el mismo, sin login (diseño
    Tesoreria2.pdf, 28/Ago/2026: "deben marcar el checklist para enviar un
    correo avisando que faltan esos documentos, un correo por documento que
    falte" + "esos los subira el cliente...mediante una magic link por doc
    faltante" - pedido explicito de Mariana). Se llama una vez POR
    documento pendiente, con un token distinto cada vez (ver
    TesoreriaDocumentoTicket) - mismo criterio de "envio por separado" que
    enviar_factura, nunca se agrupan varios documentos en un solo correo ni
    se reusa un token para dos documentos.

    No propaga la excepcion si mail-service no responde - mismo criterio
    que el resto de este archivo."""
    headers, cookies = forward_auth_headers(request)
    url_completa = f"{settings.FRONTEND_BASE_URL}/tesoreria-documento/{token}"
    html_body = _renderizar_correo(
        kicker_texto="Documento pendiente",
        kicker_bg="#FBF1DE",
        kicker_color="#9A6400",
        titulo=f"Falta un documento del contrato {id_contrato}",
        cuerpo_html=(
            f"<p style='margin:0;'>Para continuar operando el contrato <strong>{escape(id_contrato)}</strong> "
            f"todavía necesitamos que nos hagas llegar: <strong>{escape(nombre_documento)}</strong>. "
            "Usa el siguiente enlace para subirlo directamente, sin necesidad de cuenta ni contraseña.</p>"
        ),
        cta_texto="Subir mi documento",
        cta_url=url_completa,
        fineprint_texto="Este enlace expira pronto y tiene un límite de usos. Si no esperabas este correo, ignóralo.",
    )
    try:
        respuesta = requests.post(
            f"{settings.MAIL_SERVICE_URL}/api/send/",
            params={"perm": "tesoreria.editar"},
            json={
                "to": email,
                "subject": f"Documento pendiente — {nombre_documento} ({id_contrato})",
                "html_body": html_body,
            },
            headers=headers,
            cookies=cookies,
            timeout=_TIMEOUT_SEGUNDOS,
        )
    except requests.RequestException:
        logger.warning(
            "mail-service no respondio al avisar documento faltante de %s a %s", id_contrato, email, exc_info=True
        )
        return False
    if respuesta.status_code != 201:
        logger.warning(
            "mail-service rechazo el aviso de documento faltante de %s para %s: %s", id_contrato, email, respuesta.text
        )
        return False
    return True


def enviar_correo_recordatorio_factura(
    request, email: str, contraparte_nombre: str, id_flujo: str, concepto: str | None, mensaje: str | None = None
) -> bool:
    """Recordatorio manual de factura pendiente (10/Sep/2026, "Recordatorio
    de facturas se envia manualmente desde el sistema, debe presionar el
    boton") - a diferencia de enviar_correo_documento_faltante (que es para
    un contrato entero), este es puntual por pago (Flujo) que ya se hizo
    pero todavia no tiene su CFDI ligado (bandeja "Sin CFDI" de Conciliacion
    de Facturas). Nunca se dispara solo/programado, solo por este boton.

    `mensaje` (10/Sep/2026, "el recordatorio debe poder poner un mensaje la
    persona que lo envia") - opcional, texto libre que el analista escribe
    en pantalla antes de enviar; se muestra tal cual, sin plantilla fija."""
    headers, cookies = forward_auth_headers(request)
    # Sin CTA/liga a proposito (a diferencia de _renderizar_correo, que
    # exige una) - este recordatorio no trae un link de subida propio, solo
    # avisa; el proveedor responde por su via habitual con el contacto.
    concepto_html = f" por concepto de <strong>{escape(concepto)}</strong>" if concepto else ""
    mensaje_html = (
        f"""
    <div style="font-size:14.5px;color:#23252B;background:#F7F7F8;border-radius:7px;
                padding:12px 14px;margin:0 0 20px;white-space:pre-wrap;">{escape(mensaje)}</div>"""
        if mensaje
        else ""
    )
    html_body = f"""
<div style="background:#F1F3F5;padding:32px 16px;font-family:'DM Sans',Arial,sans-serif;">
  <div style="max-width:480px;margin:0 auto;background:#FFFFFF;border-radius:12px;
              border:1px solid #E1E4E9;padding:36px 34px 30px;">
    <h1 style="font-size:20px;font-weight:700;color:#23252B;margin:0 0 14px;">Todavía nos falta tu factura (CFDI)</h1>
    <p style="color:#4B4F58;font-size:14.5px;line-height:1.65;margin:0 0 20px;">
      Ya realizamos el pago{concepto_html}, pero todavía no recibimos el CFDI correspondiente.
      Por favor envíanos tu factura lo antes posible.
    </p>{mensaje_html}
    <div style="font-size:12.5px;color:#8A8F99;background:#F7F7F8;border-radius:7px;padding:10px 12px;">
      Referencia interna: {escape(id_flujo)}.
    </div>
  </div>
</div>
""".strip()
    try:
        respuesta = requests.post(
            f"{settings.MAIL_SERVICE_URL}/api/send/",
            params={"perm": "tesoreria.editar"},
            json={
                "to": email,
                "subject": f"Recordatorio: factura pendiente — {contraparte_nombre}",
                "html_body": html_body,
            },
            headers=headers,
            cookies=cookies,
            timeout=_TIMEOUT_SEGUNDOS,
        )
    except requests.RequestException:
        logger.warning("mail-service no respondio al recordatorio de factura de %s a %s", id_flujo, email, exc_info=True)
        return False
    if respuesta.status_code != 201:
        logger.warning("mail-service rechazo el recordatorio de factura de %s para %s: %s", id_flujo, email, respuesta.text)
        return False
    return True


def enviar_correo_aviso_saldo_ppd(
    request, email: str, contraparte_nombre: str, factura_folio: str, saldo_pendiente, mensaje: str | None = None
) -> bool:
    """Aviso de saldo pendiente en una factura PPD (10/Sep/2026, pendiente
    real de Jenny: "aviso por correo de saldo PPD pendiente") - una PPD se
    salda con uno o varios Complementos de Pago (REP); mientras el ultimo
    REP registrado siga con `imp_saldo_insoluto` > 0, sigue quedando debe.
    Igual que el recordatorio de CFDI faltante: nunca se dispara solo, solo
    por este boton (ver TesoreriaFacturaViewSet.aviso_saldo_pendiente)."""
    headers, cookies = forward_auth_headers(request)
    mensaje_html = (
        f"""
    <div style="font-size:14.5px;color:#23252B;background:#F7F7F8;border-radius:7px;
                padding:12px 14px;margin:0 0 20px;white-space:pre-wrap;">{escape(mensaje)}</div>"""
        if mensaje
        else ""
    )
    html_body = f"""
<div style="background:#F1F3F5;padding:32px 16px;font-family:'DM Sans',Arial,sans-serif;">
  <div style="max-width:480px;margin:0 auto;background:#FFFFFF;border-radius:12px;
              border:1px solid #E1E4E9;padding:36px 34px 30px;">
    <h1 style="font-size:20px;font-weight:700;color:#23252B;margin:0 0 14px;">Todavía tenemos un saldo pendiente contigo</h1>
    <p style="color:#4B4F58;font-size:14.5px;line-height:1.65;margin:0 0 20px;">
      La factura <strong>{escape(factura_folio)}</strong> es a plazos (PPD) y todavía tiene un saldo pendiente
      de <strong>${saldo_pendiente:,.2f} MXN</strong> por cubrir con su complemento de pago correspondiente.
    </p>{mensaje_html}
  </div>
</div>
""".strip()
    try:
        respuesta = requests.post(
            f"{settings.MAIL_SERVICE_URL}/api/send/",
            params={"perm": "facturacion-cfdi.editar"},
            json={
                "to": email,
                "subject": f"Aviso: saldo pendiente PPD — {contraparte_nombre}",
                "html_body": html_body,
            },
            headers=headers,
            cookies=cookies,
            timeout=_TIMEOUT_SEGUNDOS,
        )
    except requests.RequestException:
        logger.warning("mail-service no respondio al aviso de saldo PPD de %s a %s", factura_folio, email, exc_info=True)
        return False
    if respuesta.status_code != 201:
        logger.warning("mail-service rechazo el aviso de saldo PPD de %s para %s: %s", factura_folio, email, respuesta.text)
        return False
    return True


def enviar_correo_ticket_proveedor(request, email: str, token: str) -> bool:
    """Envia el link del ticket publico de proveedor por correo via
    mail-service (Gmail API) - mismo patron y diseño que
    pld-service/pld/mail_utils.py::enviar_correo_ticket_cliente (27/Ago/2026).

    No propaga la excepcion si mail-service no responde - un fallo de
    envio no debe tumbar la creacion del ticket en si (el token se sigue
    regresando en la respuesta como respaldo, ver views.py)."""
    headers, cookies = forward_auth_headers(request)

    url_completa = f"{settings.FRONTEND_BASE_URL}/tesoreria-ticket/{token}"
    html_body = _renderizar_correo(
        kicker_texto="Solicitud de factura",
        kicker_bg="#FBF1DE",
        kicker_color="#9A6400",
        titulo="Tienes una factura pendiente de subir",
        cuerpo_html=(
            "<p style='margin:0;'>CumbresBI te pide subir tu factura (PDF) para procesar tu pago. "
            "Usa el siguiente enlace para hacerlo — cuentas con un tiempo limitado para usarlo antes "
            "de que expire.</p>"
        ),
        cta_texto="Subir mi factura",
        cta_url=url_completa,
        fineprint_texto="Este enlace expira pronto y tiene un límite de usos. Si no esperabas este correo, ignóralo.",
    )

    try:
        respuesta = requests.post(
            f"{settings.MAIL_SERVICE_URL}/api/send/",
            params={"perm": "tesoreria.crear"},
            json={"to": email, "subject": "Enlace para subir tu factura - CumbresBI", "html_body": html_body},
            headers=headers,
            cookies=cookies,
            timeout=_TIMEOUT_SEGUNDOS,
        )
    except requests.RequestException:
        logger.warning("mail-service no respondio al enviar el ticket de proveedor a %s", email, exc_info=True)
        return False

    if respuesta.status_code != 201:
        logger.warning("mail-service rechazo el envio del ticket de proveedor a %s: %s", email, respuesta.text)
        return False
    return True
