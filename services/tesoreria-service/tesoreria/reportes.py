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

from django.db.models.functions import Coalesce

from .models import (
    TesoreriaComplementoPago,
    TesoreriaCuenta,
    TesoreriaFactura,
    TesoreriaFlujo,
    TesoreriaMovimientoBancario,
    TesoreriaNomina,
    TesoreriaSaldo,
)

# Clasificacion CFDI de un Flujo. Distinta de
# calcular_reporte_conciliacion (banco vs. interno) - esta clasifica cada
# pago segun si ya tiene o necesita un comprobante fiscal (factura/
# complemento) detras, para las 3 pantallas de Conciliacion de Facturas.
def calcular_conciliacion_cfdi(queryset) -> dict:
    """queryset ya viene filtrado (scope, mes, empresa, contrato,
    ingreso/egreso, requiere_factura) por el llamador (ver
    TesoreriaFlujoViewSet.conciliacion) - aqui solo se clasifica cada Flujo
    y, para los que ya tienen CFDI, se calcula reconocido/por_reconocer.

    Reglas (segun notas de reunion 09/Sep/2026):
    - CON_CFDI: el contrato requiere factura AND el flujo ya tiene
      factura y/o complemento ligado.
    - SIN_CFDI: el contrato requiere factura AND el flujo todavia NO tiene
      ninguno de los dos.
    - NO_REQUIERE_CFDI: el contrato no requiere factura (`requiere_factura`
      False o sin capturar).

    reconocido (solo CON_CFDI): si la factura es PUE, su propio total; si
    es PPD (se salda con un REP aparte) o no hay factura pero si complemento/
    nomina, el total de ese complemento/recibo de nomina.
    por_reconocer = reconocido - abs(total_mxp) del flujo (total_mxp viene
    negativo en egresos, hay que comparar magnitudes).

    Referencias cruzadas (10/Sep/2026, "hay que ver en que pantallas
    podemos hacer referencia a sus datos ligados...asi para todo") - cada
    fila trae ademas el folio/nombre de lo que ya tiene ligado (contrato,
    contraparte, factura/complemento), para no mostrar solo un ID crudo."""
    queryset = queryset.select_related(
        "contrato", "contrato__contraparte", "factura", "complemento", "nomina", "cuenta"
    )

    con_cfdi, sin_cfdi, no_requiere = [], [], []
    for flujo in queryset:
        requiere_factura = flujo.contrato.requiere_factura if flujo.contrato_id else None
        fila = {
            "id_flujo": flujo.id_flujo,
            "contrato": flujo.contrato_id,
            "contraparte": flujo.contrato.contraparte_id if flujo.contrato_id else None,
            "contraparte_nombre": flujo.contrato.contraparte.razon_social if flujo.contrato_id else None,
            "concepto": flujo.concepto,
            "total_mxp": flujo.total_mxp,
            "fecha_efectiva": flujo.fecha_efectiva,
            "factura": flujo.factura_id,
            "factura_folio": flujo.factura.comprobante_folio if flujo.factura_id else None,
            "complemento": flujo.complemento_id,
            "complemento_folio": flujo.complemento.folio if flujo.complemento_id else None,
            "nomina": flujo.nomina_id,
            "requiere_factura": requiere_factura,
            # factura_subtotal/iva/total (11/Sep/2026, "columnas separadas
            # importe/IVA/total en conciliacion, para Cat") - solo tiene
            # sentido si ya hay factura ligada; complementos/recibos de
            # nomina no desglosan IVA en este esquema.
            "factura_subtotal": flujo.factura.comprobante_sub_total if flujo.factura_id else None,
            "factura_iva": flujo.factura.comprobante_iva if flujo.factura_id else None,
            "factura_total": flujo.factura.comprobante_total if flujo.factura_id else None,
        }
        if requiere_factura is False:
            no_requiere.append(fila)
            continue
        if not flujo.factura_id and not flujo.complemento_id:
            sin_cfdi.append(fila)
            continue

        reconocido = None
        if flujo.factura_id and flujo.factura.comprobante_metodo_pago == "PUE":
            reconocido = flujo.factura.comprobante_total
        elif flujo.complemento_id:
            reconocido = flujo.complemento.total
        elif flujo.nomina_id:
            reconocido = flujo.nomina.total
        por_reconocer = (
            (reconocido - abs(flujo.total_mxp)) if reconocido is not None and flujo.total_mxp is not None else None
        )
        con_cfdi.append({**fila, "reconocido": reconocido, "por_reconocer": por_reconocer})

    return {"con_cfdi": con_cfdi, "sin_cfdi": sin_cfdi, "no_requiere": no_requiere}


# Conciliacion Nomina<->Recibo CFDI (14/Sep/2026, siguiente pendiente tras
# el cierre real de Nomina) - mismo patron reconocido/por_reconocer que
# calcular_conciliacion_cfdi, pero acotado a Flujos de nomina
# (periodo_nomina_id no nulo) y contra `flujo.nomina` (TesoreriaRecNomina,
# el CFDI individual del empleado), no contra factura/complemento. Los
# contratos GEN-NOMINA-<sociedad> tienen requiere_factura=False (ver
# contrato_generico_nomina), por eso calcular_conciliacion_cfdi de arriba
# los manda todos a "no_requiere" y nunca calcula este cruce.
def calcular_conciliacion_nomina(queryset) -> dict:
    """queryset ya viene filtrado (scope, fecha, empresa/proyecto/centro,
    periodo_nomina) por el llamador (ver
    TesoreriaFlujoViewSet.conciliacion_nomina) - aqui solo se separa en
    con_recibo/sin_recibo y, para los que ya tienen recibo, se calcula
    reconocido/por_reconocer.

    - CON_RECIBO: el flujo ya tiene un recibo de nomina (CFDI) vinculado.
      reconocido = recibo.total, por_reconocer = reconocido - abs(total_mxp)
      del flujo.
    - SIN_RECIBO: el flujo de nomina todavia no tiene ningun recibo
      vinculado."""
    queryset = queryset.select_related("periodo_nomina", "nomina")

    con_recibo, sin_recibo = [], []
    for flujo in queryset:
        fila = {
            "id_flujo": flujo.id_flujo,
            "periodo_nomina": flujo.periodo_nomina_id,
            "periodo_nomina_serie": flujo.periodo_nomina.serie if flujo.periodo_nomina_id else None,
            "id_empleado": flujo.id_empleado,
            "concepto": flujo.concepto,
            "total_mxp": flujo.total_mxp,
            "fecha_efectiva": flujo.fecha_efectiva,
            "nomina": flujo.nomina_id,
        }
        if not flujo.nomina_id:
            sin_recibo.append(fila)
            continue
        reconocido = flujo.nomina.total
        por_reconocer = (
            (reconocido - abs(flujo.total_mxp)) if reconocido is not None and flujo.total_mxp is not None else None
        )
        con_recibo.append({**fila, "reconocido": reconocido, "por_reconocer": por_reconocer})

    return {"con_recibo": con_recibo, "sin_recibo": sin_recibo}


def _porcentaje_cambio(cambio, base) -> Decimal | None:
    """Cambio (%) igual al del reporte legado (Wall-E Homes, formato
    origen del rediseño 11/Sep/2026) - sin base contra que comparar (cuenta
    nueva, saldo anterior en 0) no hay porcentaje que reportar."""
    if cambio is None or not base:
        return None
    return (cambio / base) * Decimal("100")


def _calcular_corte(cuentas, fecha) -> dict:
    """Un solo corte (una fecha) del reporte diario: saldo de esa fecha vs.
    el ultimo saldo capturado antes de ella, por cuenta. Factorizado de
    calcular_reporte_diario para poder pedir dos cortes (dia anterior y
    dia de hoy, como el reporte legado) sin duplicar la logica."""
    empresas: dict[str, list[dict]] = {}
    saldo_anterior_total = Decimal("0")
    saldo_hoy_total = Decimal("0")
    hay_saldo_hoy_en_alguna = False
    # nomina_total_* (11/Sep/2026, "el reporte diario debe reflejar tambien
    # la nomina de ambos tipos") - consolidado del dia completo, para verlo
    # sin tener que expandir cuenta por cuenta.
    nomina_total_quincenal = Decimal("0")
    nomina_total_semanal = Decimal("0")

    for cuenta in cuentas:
        saldo_hoy_obj = TesoreriaSaldo.objects.filter(cuenta=cuenta.id_cuenta_bancaria, fecha=fecha).first()
        saldo_anterior_obj = (
            TesoreriaSaldo.objects.filter(cuenta=cuenta.id_cuenta_bancaria, fecha__lt=fecha).order_by("-fecha").first()
        )
        transacciones = (
            TesoreriaFlujo.objects.filter(cuenta=cuenta, fecha_efectiva=fecha)
            .select_related("periodo_nomina")
            .order_by("id_flujo")
        )
        suma_transacciones = sum((t.total_mxp or Decimal("0")) for t in transacciones)
        for t in transacciones:
            if t.periodo_nomina_id and t.periodo_nomina.tipo == TesoreriaNomina.TIPO_QUINCENAL:
                nomina_total_quincenal += t.total_mxp or Decimal("0")
            elif t.periodo_nomina_id and t.periodo_nomina.tipo == TesoreriaNomina.TIPO_SEMANAL:
                nomina_total_semanal += t.total_mxp or Decimal("0")

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
            # El alias sigue siendo lo que usa la pantalla (mismo criterio
            # de siempre); banco_nombre/clabe son solo para que el correo
            # pueda mostrar banco real + CLABE en vez del alias libre.
            "banco_nombre": cuenta.banco.banco if cuenta.banco_id else None,
            "clabe": cuenta.clabe,
            "tipo": cuenta.tipo,
            "saldo_anterior": monto_anterior,
            "saldo_hoy": monto_hoy,
            "tiene_saldo_hoy": monto_hoy is not None,
            "cambio": cambio,
            "cambio_pct": _porcentaje_cambio(cambio, monto_anterior),
            "suma_transacciones": suma_transacciones,
            "diferencia": diferencia,
            "cuadra": diferencia == Decimal("0") if diferencia is not None else None,
            # nomina_tipo (11/Sep/2026, "el reporte diario debe reflejar
            # tambien la nomina de ambos tipos") - el Flujo ya se sumaba y
            # listaba como cualquier otro (misma cuenta/fecha_efectiva), pero
            # no se distinguia visualmente que fuera un pago de nomina ni de
            # que tipo (Quincenal/Semanal).
            "transacciones": [
                {
                    "id_flujo": t.id_flujo,
                    "concepto": t.concepto,
                    # descripcion_pago (11/Sep/2026, "comentario por
                    # transaccion como en el reporte legado") - campo ya
                    # existente en TesoreriaFlujo, no uno nuevo; aqui solo se
                    # expone en el reporte, igual que "PARA IMPUESTOS" o
                    # "GEORGIA" en el formato de origen.
                    "descripcion_pago": t.descripcion_pago,
                    "total_mxp": t.total_mxp,
                    "nomina_tipo": t.periodo_nomina.tipo if t.periodo_nomina_id else None,
                }
                for t in transacciones
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
            "cambio_neto_pct": _porcentaje_cambio(
                (saldo_hoy_total - saldo_anterior_total) if hay_saldo_hoy_en_alguna else None,
                saldo_anterior_total,
            ),
            "nomina_total_quincenal": nomina_total_quincenal,
            "nomina_total_semanal": nomina_total_semanal,
        },
    }


def calcular_reporte_diario(sociedades: list[str], fecha) -> dict:
    """sociedades vacio = todas las sociedades (sin filtrar) - el frontend
    siempre manda al menos una, pero el backend no lo exige para poder
    probarlo/usarlo sin esa restriccion.

    Un solo corte, el de `fecha` (14/Sep/2026, "se quitara el dia anterior
    tanto en la ui y el correo" - revierte el rediseño de dos cortes del
    11/Sep sobre el formato legado de Wall-E Homes)."""
    cuentas = TesoreriaCuenta.objects.filter(activa=True).select_related("banco").order_by("sociedad", "alias")
    if sociedades:
        cuentas = cuentas.filter(sociedad__in=sociedades)
    cuentas = list(cuentas)

    return _calcular_corte(cuentas, fecha)


def calcular_reporte_conciliacion(cuenta_id, corte_edc_id=None, fecha_inicio=None, fecha_fin=None) -> dict:
    """Reporte transaccion-por-transaccion (08/Sep/2026, finanzas.md:
    "Generate reconciliation reports (transactions vs. invoices) for both
    income and expenses") - a diferencia de calcular_reporte_diario (arriba,
    cuadre agregado saldo vs. suma de flujos), aqui se listan las lineas
    reales una por una en 3 grupos:

    - conciliados: TesoreriaMovimientoBancario con `flujo` ya ligado (a
      mano o por conciliar_automatico), con la diferencia de monto si el
      match no fue exacto.
    - sin_conciliar_banco: lineas del extracto sin flujo interno ligado
      (dinero que se movio en el banco pero no hay registro interno, o
      todavia no se concilio).
    - sin_conciliar_interno: TesoreriaFlujo de la cuenta, dentro del mismo
      rango de fechas, que ningun movimiento bancario referencia (registro
      interno que el banco todavia no refleja, o un posible error de
      captura).

    El rango de fechas es explicito (fecha_inicio/fecha_fin) o, si no se
    manda, se deriva del rango real de los movimientos encontrados (no
    tiene sentido buscar flujos "sin conciliar" fuera del periodo que se
    esta revisando)."""
    movimientos = TesoreriaMovimientoBancario.objects.filter(cuenta_id=cuenta_id)
    if corte_edc_id:
        movimientos = movimientos.filter(corte_edc_id=corte_edc_id)
    if fecha_inicio:
        movimientos = movimientos.filter(fecha__gte=fecha_inicio)
    if fecha_fin:
        movimientos = movimientos.filter(fecha__lte=fecha_fin)
    movimientos = list(movimientos.select_related("flujo").order_by("fecha"))

    conciliados = []
    sin_conciliar_banco = []
    ids_flujos_conciliados = []
    total_banco = Decimal("0")
    total_conciliado = Decimal("0")

    for movimiento in movimientos:
        monto_banco = (movimiento.abono or Decimal("0")) - (movimiento.cargo or Decimal("0"))
        total_banco += monto_banco
        fila_base = {
            "id": movimiento.id,
            "fecha": movimiento.fecha,
            "descripcion": movimiento.descripcion,
            "referencia": movimiento.referencia,
            "monto": monto_banco,
        }
        if movimiento.flujo_id:
            ids_flujos_conciliados.append(movimiento.flujo_id)
            total_flujo = movimiento.flujo.total_mxp or Decimal("0")
            total_conciliado += total_flujo
            conciliados.append(
                {
                    **fila_base,
                    "id_flujo": movimiento.flujo_id,
                    "concepto_flujo": movimiento.flujo.concepto,
                    "total_flujo": total_flujo,
                    "diferencia": monto_banco - total_flujo,
                    "cuadra": abs(monto_banco) == abs(total_flujo),
                }
            )
        else:
            sin_conciliar_banco.append(fila_base)

    fechas_movimientos = [m.fecha for m in movimientos]
    rango_inicio = fecha_inicio or (min(fechas_movimientos) if fechas_movimientos else None)
    rango_fin = fecha_fin or (max(fechas_movimientos) if fechas_movimientos else None)

    sin_conciliar_interno = []
    total_interno_sin_conciliar = Decimal("0")
    if rango_inicio and rango_fin:
        # Coalesce fecha_pago/fecha_efectiva - un flujo capturado pero
        # todavia no pagado solo tiene fecha_efectiva.
        flujos_qs = (
            TesoreriaFlujo.objects.filter(cuenta_id=cuenta_id, total_mxp__isnull=False)
            .exclude(id_flujo__in=ids_flujos_conciliados)
            .annotate(fecha_comparacion=Coalesce("fecha_pago", "fecha_efectiva"))
            .filter(fecha_comparacion__gte=rango_inicio, fecha_comparacion__lte=rango_fin)
            .order_by("fecha_comparacion")
        )
        for flujo in flujos_qs:
            total_interno_sin_conciliar += flujo.total_mxp or Decimal("0")
            sin_conciliar_interno.append(
                {
                    "id_flujo": flujo.id_flujo,
                    "concepto": flujo.concepto,
                    "total_mxp": flujo.total_mxp,
                    "fecha_pago": flujo.fecha_pago,
                    "fecha_efectiva": flujo.fecha_efectiva,
                    "pagado": flujo.pagado,
                }
            )

    return {
        "cuenta": cuenta_id,
        "rango": {"inicio": rango_inicio, "fin": rango_fin},
        "totales": {
            "total_movimientos_banco": total_banco,
            "total_conciliado": total_conciliado,
            "total_sin_conciliar_banco": total_banco - total_conciliado,
            "total_sin_conciliar_interno": total_interno_sin_conciliar,
        },
        "conciliados": conciliados,
        "sin_conciliar_banco": sin_conciliar_banco,
        "sin_conciliar_interno": sin_conciliar_interno,
    }


def sugerir_cfdi_para_flujo(flujo, tolerancia: Decimal = Decimal("1.00")) -> dict:
    """IA/heuristica de conciliacion (10/Sep/2026, notas de reunion: "IA
    propone complementos para registros con factura PPD y sin comp.;
    facturas/complementos para registros sin CFDI") - "la IA propone, el
    humano aprueba": esta funcion solo REGRESA candidatos, nunca liga nada
    sola (el enlace real sigue pasando por
    TesoreriaFlujoViewSet.vincular_factura, que exige una accion explicita
    del analista).

    Heuristica: misma contraparte que el contrato del flujo + monto dentro
    de `tolerancia` MXP, excluyendo comprobantes que ya tienen otro flujo
    ligado (para no proponer dos veces el mismo). Solo tiene sentido pedir
    candidatos para lo que el flujo todavia NO tiene (si ya tiene factura,
    solo se buscan complementos; si ya tiene complemento, solo facturas)."""
    if not flujo.contrato_id or flujo.total_mxp is None:
        return {"facturas": [], "complementos": []}

    contraparte_id = flujo.contrato.contraparte_id
    monto = flujo.total_mxp

    candidatos_factura = []
    if not flujo.factura_id:
        facturas = TesoreriaFactura.objects.filter(contraparte_id=contraparte_id).exclude(flujos__isnull=False)
        for f in facturas:
            if f.comprobante_total is None:
                continue
            diferencia = abs(f.comprobante_total - monto)
            if diferencia <= tolerancia:
                candidatos_factura.append(
                    {
                        "id": f.id,
                        "timbre_uuid": f.timbre_uuid,
                        "folio": f.comprobante_folio,
                        "total": f.comprobante_total,
                        "metodo_pago": f.comprobante_metodo_pago,
                        "diferencia": diferencia,
                    }
                )
        candidatos_factura.sort(key=lambda c: c["diferencia"])

    candidatos_complemento = []
    if not flujo.complemento_id:
        complementos = TesoreriaComplementoPago.objects.filter(contraparte_id=contraparte_id).exclude(
            flujos__isnull=False
        )
        for c in complementos:
            if c.total is None:
                continue
            diferencia = abs(c.total - monto)
            if diferencia <= tolerancia:
                candidatos_complemento.append(
                    {"id": c.id, "timbre_uuid": c.timbre_uuid, "folio": c.folio, "total": c.total, "diferencia": diferencia}
                )
        candidatos_complemento.sort(key=lambda c: c["diferencia"])

    return {"facturas": candidatos_factura, "complementos": candidatos_complemento}


def sugerir_cfdi_en_lote(queryset, tolerancia: Decimal = Decimal("1.00")) -> list[dict]:
    """Sugerencias para VARIOS flujos a la vez (10/Sep/2026, "aprobar en
    lote, no uno por uno") - regresa solo el MEJOR candidato por flujo (el
    de menor diferencia entre factura/complemento) y una `confianza`
    simple: 'alta' si el monto coincide exacto (diferencia = 0) y es el
    UNICO candidato encontrado (nada ambiguo que decidir), 'media' en
    cualquier otro caso con candidato. Flujos sin ningun candidato no
    aparecen en la lista - "la IA propone, el humano aprueba" sigue
    aplicando: esto solo ahorra abrir cada pago uno por uno, la aprobacion
    real sigue siendo manual (ver TesoreriaFlujoViewSet.vincular_factura).

    23/Sep/2026 - fix real: la version anterior llamaba
    sugerir_cfdi_para_flujo() (2 queries por flujo) dentro de un for sobre
    TODOS los flujos "Sin CFDI" del mes - con datos reales (decenas/cientos
    de flujos) eso son cientos de queries y el request se cae con 502 en
    Cloud Run ("el servicio no respondio"). Aqui se cargan facturas y
    complementos SIN LIGAR una sola vez (agrupados por contraparte_id) y
    se hace el match en Python, sin volver a tocar la BD por flujo."""
    flujos = list(
        queryset.select_related("contrato", "contrato__contraparte").exclude(factura__isnull=False).exclude(
            complemento__isnull=False
        )
    )
    contraparte_ids = {f.contrato.contraparte_id for f in flujos if f.contrato_id}
    if not contraparte_ids:
        return []

    facturas_por_contraparte: dict[str, list[dict]] = {}
    for f in TesoreriaFactura.objects.filter(
        contraparte_id__in=contraparte_ids, comprobante_total__isnull=False
    ).exclude(flujos__isnull=False):
        facturas_por_contraparte.setdefault(f.contraparte_id, []).append(
            {
                "id": f.id,
                "timbre_uuid": f.timbre_uuid,
                "folio": f.comprobante_folio,
                "total": f.comprobante_total,
            }
        )

    complementos_por_contraparte: dict[str, list[dict]] = {}
    for c in TesoreriaComplementoPago.objects.filter(
        contraparte_id__in=contraparte_ids, total__isnull=False
    ).exclude(flujos__isnull=False):
        complementos_por_contraparte.setdefault(c.contraparte_id, []).append(
            {"id": c.id, "timbre_uuid": c.timbre_uuid, "folio": c.folio, "total": c.total}
        )

    sugerencias = []
    for flujo in flujos:
        if not flujo.contrato_id or flujo.total_mxp is None:
            continue
        contraparte_id = flujo.contrato.contraparte_id
        monto = flujo.total_mxp

        candidatos = []
        for f in facturas_por_contraparte.get(contraparte_id, []):
            diferencia = abs(f["total"] - monto)
            if diferencia <= tolerancia:
                candidatos.append({**f, "tipo": "factura", "diferencia": diferencia})
        for c in complementos_por_contraparte.get(contraparte_id, []):
            diferencia = abs(c["total"] - monto)
            if diferencia <= tolerancia:
                candidatos.append({**c, "tipo": "complemento", "diferencia": diferencia})
        if not candidatos:
            continue

        candidatos.sort(key=lambda c: c["diferencia"])
        mejor = candidatos[0]
        confianza = "alta" if len(candidatos) == 1 and mejor["diferencia"] == Decimal("0") else "media"
        sugerencias.append(
            {
                "id_flujo": flujo.id_flujo,
                "contraparte_nombre": flujo.contrato.contraparte.razon_social,
                "concepto": flujo.concepto,
                "total_mxp": flujo.total_mxp,
                "tipo": mejor["tipo"],
                "id": mejor["id"],
                "timbre_uuid": mejor["timbre_uuid"],
                "folio": mejor["folio"],
                "confianza": confianza,
            }
        )
    return sugerencias
