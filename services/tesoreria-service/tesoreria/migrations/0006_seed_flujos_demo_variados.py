from decimal import Decimal

from django.db import migrations

# Mas ejemplos de Flujo (25/Ago/2026) - variando los estados que importan
# para probar la pantalla: pendiente sin autorizar, rechazado, y uno con
# complemento de pago pendiente. Reusa la cuenta/contrato demo de
# 0005_seed_flujo_demo (mismo criterio: nada de correos/datos de personas
# reales).
CUENTA_DEMO_ID = "DEMOCT04"
CONTRATO_DEMO_ID = "DEMO-DEMOCP01-001"

FLUJOS_DEMO = [
    {
        # Reembolso a un empleado, sin contrato (caso valido segun el
        # modelo - contrato es nullable), todavia sin autorizar.
        "id_flujo": "demo0002",
        "contrato_id": None,
        "fecha_efectiva": "2026-08-20",
        "concepto": "Reembolso de gastos de viaje",
        "reembolso": True,
        "id_empleado_reembolso": "EMPDEMO1",
        "total_mxp": Decimal("4350.00"),
        "autorizacion": False,
        "pagado": False,
        "requiere_complemento": False,
        "estado_cfdi": "SIN PENDIENTES DE CFDI",
        "validacion_estado": "PENDIENTE",
        "created_by": "demo.captura@cypcumbres.mx",
        "updated_by": "demo.captura@cypcumbres.mx",
    },
    {
        # Rechazado - contraparte de aprobar(), queda evidencia sin poder
        # pagarse (ver TesoreriaFlujoViewSet.rechazar).
        "id_flujo": "demo0003",
        "fecha_efectiva": "2026-08-18",
        "concepto": "Pago a proveedor duplicado",
        "reembolso": False,
        "total_mxp": Decimal("15800.00"),
        "autorizacion": False,
        "pagado": False,
        "requiere_complemento": False,
        "estado_cfdi": "SIN PENDIENTES DE CFDI",
        "validacion_estado": "RECHAZADA",
        "comentarios": "Factura ya pagada en el flujo demo1eb1, se rechaza para no duplicar.",
        "created_by": "demo.captura@cypcumbres.mx",
        "updated_by": "demo.captura@cypcumbres.mx",
    },
    {
        # Requiere complemento de pago (PPD) y todavia no llega.
        "id_flujo": "demo0004",
        "fecha_efectiva": "2026-08-22",
        "concepto": "Servicio de mantenimiento (PPD)",
        "reembolso": False,
        "total_mxp": Decimal("32000.00"),
        "autorizacion": True,
        "autorizado_por": "demo.autoriza@cypcumbres.mx",
        "fecha_autorizacion": "2026-08-22",
        "pagado": False,
        "requiere_complemento": True,
        "estado_cfdi": "PENDIENTE DE COMPLEMENTO",
        "aprobacion_lista": True,
        "validacion_estado": "APROBADA",
        "created_by": "demo.captura@cypcumbres.mx",
        "updated_by": "demo.captura@cypcumbres.mx",
    },
]


def seed(apps, schema_editor):
    TesoreriaFlujo = apps.get_model("tesoreria", "TesoreriaFlujo")
    for datos in FLUJOS_DEMO:
        defaults = {"contrato_id": CONTRATO_DEMO_ID, **datos, "cuenta_id": CUENTA_DEMO_ID}
        TesoreriaFlujo.objects.get_or_create(id_flujo=datos["id_flujo"], defaults=defaults)


def unseed(apps, schema_editor):
    TesoreriaFlujo = apps.get_model("tesoreria", "TesoreriaFlujo")
    TesoreriaFlujo.objects.filter(id_flujo__in=[d["id_flujo"] for d in FLUJOS_DEMO]).delete()


class Migration(migrations.Migration):

    dependencies = [
        ("tesoreria", "0005_seed_flujo_demo"),
    ]

    operations = [
        migrations.RunPython(seed, unseed),
    ]
