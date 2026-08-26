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
