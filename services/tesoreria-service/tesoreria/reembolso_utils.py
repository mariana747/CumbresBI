"""Calculo de la ventana mensual de reembolsos (minuta 03/Sep/2026 + ajuste
04/Sep/2026, pedido explicito de Mariana - reemplaza por completo la regla
anterior de "cierre bloqueado + periodo de gracia del mes siguiente"):

- Durante el mes, cualquier fecha_gasto del mismo mes/año que hoy se acepta
  (sin importar el dia), salvo que sea una fecha futura.
- En NINGUN caso se acepta una fecha_gasto de un mes distinto al que corre -
  "no se pueden reembolsar facturas de agosto en septiembre", sin excepcion
  ni periodo de gracia (esto reemplaza la gracia que existia antes para el
  mes anterior).
- En los ULTIMOS 2 DIAS HABILES del mes, la regla se vuelve mas estricta:
  solo se acepta un comprobante fechado EXACTAMENTE ese mismo dia - "el 29
  de septiembre puede subir una factura del 29 de septiembre pero no del
  28" (ejemplo real dado por Mariana).
- El ULTIMO dia habil del mes ademas solo recibe tickets hasta MEDIODIA
  (12:00 hrs, hora local) - despues de esa hora la ventana del mes ya
  cerro por completo, sin excepcion.

Festivos oficiales: en vez de un catalogo mantenido a mano, se sincronizan
de Nager.Date (https://date.nager.at, API publica gratuita, sin API key,
cubre MX) - pedido explicito de Mariana 03/Sep/2026 ("usemos Nager.Date o
OpenHolidays API"). TesoreriaDiaFestivo actua como cache local: se
sincroniza como mucho una vez por año natural (perezoso, la primera vez que
se necesita ese año), asi el calculo de dias habiles nunca depende de una
llamada de red en el camino caliente de crear un ticket."""

import logging
from calendar import monthrange
from datetime import date, datetime, time

import requests
from django.db import transaction

from .models import TesoreriaDiaFestivo

logger = logging.getLogger(__name__)

NAGER_DATE_URL = "https://date.nager.at/api/v3/PublicHolidays/{anio}/MX"

# Hora de corte del ultimo dia habil del mes (12:00 hrs, hora local del
# servidor - TIME_ZONE = "America/Mexico_City" en config/settings.py).
HORA_CORTE_ULTIMO_DIA = time(12, 0)


def sincronizar_festivos_mx(anio: int) -> bool:
    """Trae los festivos oficiales de MX para `anio` desde Nager.Date y los
    guarda/actualiza en TesoreriaDiaFestivo. Regresa True si sincronizo bien,
    False si la API fallo (fail-open - ver _dias_habiles_del_mes, un festivo
    no sincronizado a tiempo solo hace que ese dia cuente como habil, nunca
    bloquea la creacion de tickets por una caida externa)."""
    try:
        respuesta = requests.get(NAGER_DATE_URL.format(anio=anio), timeout=5)
        respuesta.raise_for_status()
        festivos = respuesta.json()
    except (requests.RequestException, ValueError) as exc:
        logger.warning("No se pudo sincronizar festivos MX %s desde Nager.Date: %s", anio, exc)
        return False

    with transaction.atomic():
        for item in festivos:
            TesoreriaDiaFestivo.objects.update_or_create(
                fecha=item["date"],
                defaults={"descripcion": item.get("localName") or item.get("name") or "Festivo oficial"},
            )
    return True


def _es_dia_habil(fecha: date, festivos: set[date]) -> bool:
    return fecha.weekday() < 5 and fecha not in festivos


def _dias_habiles_del_mes(anio: int, mes: int) -> list[date]:
    festivos_qs = TesoreriaDiaFestivo.objects.filter(fecha__year=anio, fecha__month=mes)
    # Sincronizacion perezosa: si no hay NINGUN festivo cacheado para todo
    # este año (no solo este mes), se intenta sincronizar una vez. Si la API
    # esta caida, se sigue sin festivos ese año (fail-open) en vez de
    # bloquear la creacion de tickets por una dependencia externa.
    if not TesoreriaDiaFestivo.objects.filter(fecha__year=anio).exists():
        sincronizar_festivos_mx(anio)
        festivos_qs = TesoreriaDiaFestivo.objects.filter(fecha__year=anio, fecha__month=mes)

    festivos = set(festivos_qs.values_list("fecha", flat=True))
    _, ultimo_dia = monthrange(anio, mes)
    dias = [date(anio, mes, d) for d in range(1, ultimo_dia + 1)]
    return [d for d in dias if _es_dia_habil(d, festivos)]


def ultimos_dos_dias_habiles(anio: int, mes: int) -> list[date]:
    """Los ultimos 2 dias habiles de `mes`/`anio`, en orden ascendente
    (penultimo, ultimo). Lista mas corta si el mes no tiene al menos 2 dias
    habiles (caso de borde que no deberia pasar en la practica)."""
    habiles = _dias_habiles_del_mes(anio, mes)
    return habiles[-2:]


def validar_fecha_limite(ahora: datetime, fecha_gasto: date | None) -> str | None:
    """Valida las reglas de ventana mensual al crear un ticket de reembolso
    (ver docstring del modulo). `ahora` debe ser hora local (timezone.
    localtime(timezone.now()) en el llamador, no UTC crudo) - la hora
    importa para el corte de mediodia del ultimo dia habil. Regresa un
    mensaje de error si debe rechazarse, o None si procede."""
    hoy = ahora.date()

    if fecha_gasto is None:
        return None

    # Un gasto no puede ser de una fecha que todavia no llega, sin importar
    # el mes (bug real reportado 03/Sep/2026: este chequeo debe ir ANTES
    # que el de "mismo mes", si no un dia futuro dentro del mes en curso se
    # cuela).
    if fecha_gasto > hoy:
        return "La fecha del gasto no puede ser una fecha futura."

    # En ningun caso se acepta un mes distinto al que corre - sin periodo
    # de gracia para el mes anterior (04/Sep/2026: "no se pueden reembolsar
    # facturas de agosto en septiembre", confirmado explicitamente por
    # Mariana, sin excepcion - esto reemplaza la gracia que existia antes).
    if fecha_gasto.year != hoy.year or fecha_gasto.month != hoy.month:
        return "Solo se pueden solicitar reembolsos de comprobantes emitidos en el mes en curso."

    ultimos_dos = ultimos_dos_dias_habiles(hoy.year, hoy.month)
    if hoy not in ultimos_dos:
        return None

    # Estamos en uno de los ultimos 2 dias habiles del mes: regla estricta
    # de "mismo dia" - el comprobante debe estar fechado exactamente hoy,
    # ningun otro dia del mes (aunque tambien sea del mes en curso).
    if fecha_gasto != hoy:
        return (
            "En los últimos 2 días hábiles del mes solo se aceptan comprobantes "
            "emitidos ese mismo día."
        )

    # El ultimo dia habil del mes ademas solo recibe hasta mediodia.
    if hoy == ultimos_dos[-1] and ahora.time() > HORA_CORTE_ULTIMO_DIA:
        return (
            "El último día hábil del mes solo recibe tickets hasta las 12:00 hrs. "
            "La ventana de este mes ya cerró."
        )

    return None
