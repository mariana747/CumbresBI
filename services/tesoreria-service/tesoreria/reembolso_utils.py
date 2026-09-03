"""Calculo de la fecha limite mensual de reembolsos (minuta 03/Sep/2026,
pedido explicito de Mariana): los ultimos 2 dias habiles de cada mes quedan
bloqueados para que la contadora haga el cierre; el mes siguiente se acepta
un ticket cuyo fecha_gasto caiga en esos 2 dias (periodo de gracia), pero
uno con fecha_gasto igual o anterior a la fecha de corte de ese mes ya no
se acepta - "se le paso su ventana y se pierde", confirmado explicitamente
por Mariana en el chat, sin excepcion.

Festivos oficiales: en vez de un catalogo mantenido a mano, se sincronizan
de Nager.Date (https://date.nager.at, API publica gratuita, sin API key,
cubre MX) - pedido explicito de Mariana 03/Sep/2026 ("usemos Nager.Date o
OpenHolidays API"). TesoreriaDiaFestivo actua como cache local: se
sincroniza como mucho una vez por año natural (perezoso, la primera vez que
se necesita ese año), asi el calculo de dias habiles nunca depende de una
llamada de red en el camino caliente de crear un ticket."""

import logging
from calendar import monthrange
from datetime import date

import requests
from django.db import transaction

from .models import TesoreriaDiaFestivo

logger = logging.getLogger(__name__)

NAGER_DATE_URL = "https://date.nager.at/api/v3/PublicHolidays/{anio}/MX"


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


def ultimos_dos_dias_habiles_y_corte(anio: int, mes: int) -> tuple[list[date], date | None]:
    """Regresa (bloqueados, fecha_corte) para el mes/anio dado. `bloqueados`
    son los ultimos 2 dias habiles (nadie puede subir tickets esos dias);
    `fecha_corte` es el dia habil inmediato anterior (ultimo dia permitido
    para subir). None si el mes no tiene al menos 3 dias habiles (caso de
    borde que no debería pasar en la practica)."""
    habiles = _dias_habiles_del_mes(anio, mes)
    if len(habiles) < 2:
        return habiles, None
    bloqueados = habiles[-2:]
    corte = habiles[-3] if len(habiles) >= 3 else None
    return bloqueados, corte


def _mes_anterior(anio: int, mes: int) -> tuple[int, int]:
    if mes == 1:
        return anio - 1, 12
    return anio, mes - 1


def validar_fecha_limite(hoy: date, fecha_gasto: date | None) -> str | None:
    """Valida las reglas de cierre mensual al crear un ticket de reembolso.
    Regresa un mensaje de error si debe rechazarse, o None si procede."""
    bloqueados_hoy, _ = ultimos_dos_dias_habiles_y_corte(hoy.year, hoy.month)
    if hoy in bloqueados_hoy:
        return (
            "No se pueden subir tickets de reembolso durante el cierre de mes "
            "(últimos 2 días hábiles). Podrás subir de nuevo a partir del día 1 "
            "del siguiente mes."
        )

    if fecha_gasto is None:
        return None

    # 03/Sep/2026 (bug real reportado por Mariana): un gasto no puede ser
    # de una fecha que todavia no llega, sin importar el mes - antes esto
    # se colaba porque el chequeo de "mismo mes que hoy" (siguiente linea)
    # se evaluaba antes que la de futuro, aceptando cualquier dia dentro
    # del mes en curso aunque fuera posterior a hoy.
    if fecha_gasto > hoy:
        return "La fecha del gasto no puede ser una fecha futura."

    if fecha_gasto.year == hoy.year and fecha_gasto.month == hoy.month:
        return None

    # fecha_gasto en un mes anterior al actual - solo se acepta si cae
    # exactamente en los 2 dias bloqueados de ESE mes (periodo de gracia,
    # se pudo haber quedado fuera por el cierre); cualquier otra fecha
    # anterior ya se le paso su ventana y no se acepta, sin excepcion.
    anio_prev, mes_prev = fecha_gasto.year, fecha_gasto.month
    es_mes_inmediato_anterior = (anio_prev, mes_prev) == _mes_anterior(hoy.year, hoy.month)
    if not es_mes_inmediato_anterior:
        return "La fecha del gasto es de un mes ya cerrado. Ya no se puede registrar este ticket."

    bloqueados_prev, corte_prev = ultimos_dos_dias_habiles_y_corte(anio_prev, mes_prev)
    if fecha_gasto in bloqueados_prev:
        return None
    return (
        "La fecha del gasto es anterior a la fecha de corte del mes pasado "
        f"({corte_prev.isoformat() if corte_prev else 'desconocida'}). Ya no se puede registrar este ticket."
    )
