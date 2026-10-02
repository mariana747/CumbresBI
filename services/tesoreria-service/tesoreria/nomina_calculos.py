"""Cálculo de ISR, SBC e IMSS obrero para nómina mexicana.

Las tablas ISR viven en TesoreriaTablaISR (DB), no hardcodeadas aquí.
Este módulo expone helpers puros (sin acceso a DB) y el helper principal
`calcular_nomina()` que sí consulta la tabla.
"""
from decimal import ROUND_HALF_UP, Decimal

# UMA diaria 2026 (DOF 01/Feb/2026)
UMA_DIARIA_2026 = Decimal("113.14")

# Factor de integración mínimo legal 2026
# (aguinaldo 15 días + prima vacacional 6 días × 25% / 365)
FACTOR_INTEGRACION_MINIMO = Decimal("1.0452")


def _dos(valor: Decimal) -> Decimal:
    return valor.quantize(Decimal("0.01"), rounding=ROUND_HALF_UP)


def calcular_isr_con_tabla(ingreso_gravable: Decimal, renglones) -> Decimal:
    """ISR = cuota_fija + (ingreso_gravable − límite_inferior) × porcentaje.

    `renglones` es un iterable de TesoreriaTablaISR ordenado por limite_inferior.
    Devuelve 0 si ingreso_gravable <= 0 o no hay tabla.
    """
    if ingreso_gravable <= Decimal("0"):
        return Decimal("0.00")
    for r in renglones:
        if r.limite_superior is None or ingreso_gravable <= r.limite_superior:
            excedente = ingreso_gravable - r.limite_inferior
            isr = r.cuota_fija + excedente * r.porcentaje
            return _dos(max(isr, Decimal("0")))
    return Decimal("0.00")


def calcular_sbc_diario(
    salario_diario: Decimal,
    factor_integracion: Decimal = FACTOR_INTEGRACION_MINIMO,
) -> Decimal:
    """SBC diario = SDI = salario_diario × factor_integración."""
    return _dos(salario_diario * factor_integracion)


def calcular_imss_obrero(sbc_diario: Decimal, dias: int, uma_diaria: Decimal = UMA_DIARIA_2026) -> dict:
    """Cuotas IMSS a cargo del trabajador (2026).

    Rama          | Base                          | Tasa obrero
    --------------|-------------------------------|------------
    EM especie    | SBC periodo                   | 0.40 %
    EM dinero     | SBC periodo − 3 UMAs periodo  | 0.25 %  (sobre excedente)
    Invalidez/Vida| SBC periodo                   | 0.625 %
    CEAV          | SBC periodo                   | 1.125 %
    Retiro        | —                             | 0 % (solo patrón)
    Guarderías    | —                             | 0 % (solo patrón)
    """
    sbc_periodo = _dos(sbc_diario * dias)
    uma_periodo = _dos(uma_diaria * dias)

    em_especie = _dos(sbc_periodo * Decimal("0.004"))

    excedente_3uma = max(sbc_periodo - uma_periodo * 3, Decimal("0"))
    em_dinero = _dos(excedente_3uma * Decimal("0.0025"))

    invalidez_vida = _dos(sbc_periodo * Decimal("0.00625"))
    ceav = _dos(sbc_periodo * Decimal("0.01125"))

    total = _dos(em_especie + em_dinero + invalidez_vida + ceav)
    return {
        "em_especie": em_especie,
        "em_dinero": em_dinero,
        "invalidez_vida": invalidez_vida,
        "ceav": ceav,
        "total_imss_obrero": total,
    }


def calcular_nomina(
    salario_diario: Decimal,
    dias: int,
    periodicidad: str,
    factor_integracion: Decimal = FACTOR_INTEGRACION_MINIMO,
    fecha_vigencia=None,
) -> dict:
    """Calcula ISR, SBC e IMSS para un empleado.

    Consulta TesoreriaTablaISR en DB para la tabla ISR vigente.
    `periodicidad`: 'QUINCENAL' | 'SEMANAL'
    `fecha_vigencia`: date para filtrar vigencia; None = hoy.
    """
    from datetime import date

    from .models import TesoreriaTablaISR

    hoy = fecha_vigencia or date.today()

    renglones = TesoreriaTablaISR.objects.filter(
        periodicidad=periodicidad,
        vigencia_inicio__lte=hoy,
    ).filter(
        models_q_vigencia_fin_ok(hoy)
    ).order_by("limite_inferior")

    ingreso_bruto = _dos(salario_diario * dias)
    isr = calcular_isr_con_tabla(ingreso_bruto, renglones)

    sbc_diario = calcular_sbc_diario(salario_diario, factor_integracion)
    imss = calcular_imss_obrero(sbc_diario, dias)

    total_deducciones = _dos(isr + imss["total_imss_obrero"])
    neto = _dos(ingreso_bruto - total_deducciones)

    return {
        "salario_diario": salario_diario,
        "dias": dias,
        "ingreso_bruto": ingreso_bruto,
        "isr": isr,
        "sbc_diario": sbc_diario,
        "imss_obrero": imss,
        "total_deducciones": total_deducciones,
        "neto": neto,
    }


def models_q_vigencia_fin_ok(hoy):
    """Q para filtrar renglones vigentes: vigencia_fin IS NULL OR vigencia_fin >= hoy."""
    from django.db.models import Q

    return Q(vigencia_fin__isnull=True) | Q(vigencia_fin__gte=hoy)
