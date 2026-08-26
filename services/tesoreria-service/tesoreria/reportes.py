"""Reporte diario de saldos (26/Ago/2026, ver documentos/finanzas.md
"Generate daily reports on bank transactions"). Logica de calculo separada
de views.py para poder probarla sin pasar por DRF/APIRequestFactory.

Regla de negocio (finanzas.md, citado):
- El reporte se genera por empresa (seleccion multiple), trae todas las
  cuentas activas de esas empresas.
- Por cada cuenta se listan las transacciones (Flujos) de ese dia.
- Se suman las transacciones y se comparan contra el cambio de saldo
  (saldo_hoy - saldo_ayer). Si no cuadra, la diferencia se reporta (el
  frontend la pinta en rojo); si cuadra, es cero.
- Al final: saldo consolidado de todas las cuentas/empresas elegidas y el
  cambio neto.
"""

from decimal import Decimal

from .models import TesoreriaCuenta, TesoreriaFlujo, TesoreriaSaldo


def calcular_reporte_diario(sociedades: list[str], fecha) -> dict:
    """sociedades vacio = todas las sociedades (sin filtrar) - el frontend
    siempre manda al menos una, pero el backend no lo exige para poder
    probarlo/usarlo sin esa restriccion."""
    cuentas = TesoreriaCuenta.objects.filter(activa=True).select_related("banco").order_by("sociedad", "alias")
    if sociedades:
        cuentas = cuentas.filter(sociedad__in=sociedades)

    empresas: dict[str, list[dict]] = {}
    saldo_anterior_total = Decimal("0")
    saldo_hoy_total = Decimal("0")
    hay_saldo_hoy_en_alguna = False

    for cuenta in cuentas:
        saldo_hoy_obj = TesoreriaSaldo.objects.filter(cuenta=cuenta.id_cuenta_bancaria, fecha=fecha).first()
        saldo_anterior_obj = (
            TesoreriaSaldo.objects.filter(cuenta=cuenta.id_cuenta_bancaria, fecha__lt=fecha).order_by("-fecha").first()
        )
        transacciones = TesoreriaFlujo.objects.filter(cuenta=cuenta, fecha_efectiva=fecha).order_by("id_flujo")
        suma_transacciones = sum((t.total_mxp or Decimal("0")) for t in transacciones)

        monto_anterior = saldo_anterior_obj.saldo if saldo_anterior_obj else Decimal("0")
        monto_hoy = saldo_hoy_obj.saldo if saldo_hoy_obj else None
        cambio = (monto_hoy - monto_anterior) if monto_hoy is not None else None
        diferencia = (cambio - suma_transacciones) if cambio is not None else None

        saldo_anterior_total += monto_anterior
        if monto_hoy is not None:
            saldo_hoy_total += monto_hoy
            hay_saldo_hoy_en_alguna = True

        fila = {
            "id_cuenta_bancaria": cuenta.id_cuenta_bancaria,
            "alias": cuenta.alias or cuenta.id_cuenta_bancaria,
            "tipo": cuenta.tipo,
            "saldo_anterior": monto_anterior,
            "saldo_hoy": monto_hoy,
            "tiene_saldo_hoy": monto_hoy is not None,
            "cambio": cambio,
            "suma_transacciones": suma_transacciones,
            "diferencia": diferencia,
            "cuadra": diferencia == Decimal("0") if diferencia is not None else None,
            "transacciones": [
                {"id_flujo": t.id_flujo, "concepto": t.concepto, "total_mxp": t.total_mxp} for t in transacciones
            ],
        }
        empresas.setdefault(cuenta.sociedad or "", []).append(fila)

    return {
        "fecha": fecha,
        "sociedades": [{"sociedad": rfc, "cuentas": filas} for rfc, filas in empresas.items()],
        "consolidado": {
            "saldo_anterior_total": saldo_anterior_total,
            # Si ninguna cuenta tiene saldo capturado hoy, no tiene sentido
            # reportar un "total de hoy" de 0 (se veria como que el dinero
            # desaparecio) - se deja None y el frontend lo muestra como "—".
            "saldo_hoy_total": saldo_hoy_total if hay_saldo_hoy_en_alguna else None,
            "cambio_neto": (saldo_hoy_total - saldo_anterior_total) if hay_saldo_hoy_en_alguna else None,
        },
    }
