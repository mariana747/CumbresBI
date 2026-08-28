import logging

import requests
from cumbresbi_scope import forward_auth_headers
from django.conf import settings
from django.utils.html import escape

logger = logging.getLogger(__name__)

_TIMEOUT_SEGUNDOS = 10

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


def _fila_cuenta_html(fila: dict) -> str:
    diferencia = fila["diferencia"]
    if diferencia is None:
        texto_diferencia = "Sin saldo capturado"
        color_diferencia = "#9BA0AB"
    elif diferencia == 0:
        texto_diferencia = "0.00"
        color_diferencia = _VERDE
    else:
        texto_diferencia = f"{diferencia:,.2f}"
        color_diferencia = _ROJO
    cambio_texto = f"{fila['cambio']:,.2f}" if fila["cambio"] is not None else "—"
    return f"""
    <tr>
      <td style="padding:8px 10px;border-bottom:1px solid #EEEFF1;">{escape(fila['alias'])}</td>
      <td style="padding:8px 10px;border-bottom:1px solid #EEEFF1;text-align:right;">{fila['saldo_anterior']:,.2f}</td>
      <td style="padding:8px 10px;border-bottom:1px solid #EEEFF1;text-align:right;">{cambio_texto}</td>
      <td style="padding:8px 10px;border-bottom:1px solid #EEEFF1;text-align:right;">{fila['suma_transacciones']:,.2f}</td>
      <td style="padding:8px 10px;border-bottom:1px solid #EEEFF1;text-align:right;color:{color_diferencia};font-weight:700;">
        {texto_diferencia}
      </td>
    </tr>"""


def _renderizar_reporte(reporte: dict) -> str:
    filas_html = "".join(
        _fila_cuenta_html(fila) for empresa in reporte["sociedades"] for fila in empresa["cuentas"]
    )
    consolidado = reporte["consolidado"]
    saldo_hoy_texto = (
        f"{consolidado['saldo_hoy_total']:,.2f}" if consolidado["saldo_hoy_total"] is not None else "—"
    )
    cambio_neto_texto = (
        f"{consolidado['cambio_neto']:,.2f}" if consolidado["cambio_neto"] is not None else "—"
    )
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
               letter-spacing:-0.01em;">Reporte diario de saldos — {reporte['fecha']}</h1>
    <table style="width:100%;border-collapse:collapse;font-size:13px;color:#4B4F58;">
      <thead>
        <tr style="text-align:left;">
          <th style="padding:8px 10px;border-bottom:2px solid #E1E4E9;">Cuenta</th>
          <th style="padding:8px 10px;border-bottom:2px solid #E1E4E9;text-align:right;">Saldo anterior</th>
          <th style="padding:8px 10px;border-bottom:2px solid #E1E4E9;text-align:right;">Cambio</th>
          <th style="padding:8px 10px;border-bottom:2px solid #E1E4E9;text-align:right;">Transacciones</th>
          <th style="padding:8px 10px;border-bottom:2px solid #E1E4E9;text-align:right;">Diferencia</th>
        </tr>
      </thead>
      <tbody>{filas_html}</tbody>
    </table>
    <div style="margin-top:20px;padding-top:16px;border-top:2px solid #E1E4E9;
                display:flex;justify-content:space-between;font-size:14px;color:#23252B;">
      <div><strong>Saldo consolidado:</strong> {saldo_hoy_texto}</div>
      <div><strong>Cambio neto:</strong> {cambio_neto_texto}</div>
    </div>
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


def enviar_factura(request, destinatario: str, factura) -> bool:
    """Envia UNA factura por correo via mail-service - se llama una vez por
    factura seleccionada desde TesoreriaFacturaViewSet.enviar_masivo (envio
    "por separado", ver finanzas.md: "Multiple invoices can be selected to
    send massively (separately)"). No propaga la excepcion, mismo criterio
    que enviar_reporte_diario."""
    headers, cookies = forward_auth_headers(request)
    html_body = _renderizar_factura(factura)
    folio_texto = f"{factura.comprobante_serie or ''}{factura.comprobante_folio or factura.timbre_uuid}"
    try:
        respuesta = requests.post(
            f"{settings.MAIL_SERVICE_URL}/api/send/",
            params={"perm": "facturacion-cfdi.editar"},
            json={
                "to": destinatario,
                "subject": f"Factura {folio_texto}",
                "html_body": html_body,
            },
            headers=headers,
            cookies=cookies,
            timeout=_TIMEOUT_SEGUNDOS,
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
