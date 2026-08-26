from decimal import Decimal

from django.db import migrations

# Un flujo de ejemplo completo (25/Ago/2026, para ver las 4 pestañas del
# formulario llenas con datos reales) - basado en un registro real del
# AppSheet original, pero con los correos de las personas que aparecian
# ahi (autorizado_por/comprobacion_asignada_a/created_by/updated_by)
# sustituidos por direcciones demo.* - no se meten correos de personas
# reales en un seed de ejemplo. El resto de los valores (montos, fechas,
# estado_cfdi, permiso, etc.) se dejan igual al original.
CONTRAPARTE_DEMO = ("DEMOCP01", "Contraparte Demo Fideicomiso")

CUENTA_DEMO = ("DEMOCT04", "DEMO/SANTANDER/0869 FIDEICOMISO", "000000000000000004")

CONTRATO_DEMO = {
    "id_contrato": "DEMO-DEMOCP01-001",
    "sociedad": "DEMO-SOC",
    "tipo": "INTERNO",
    "concepto_factura": "Ingresos en proceso de conciliación",
    "status": "ACTIVO",
}

FLUJO_DEMO = {
    "id_flujo": "demo1eb1",
    "fecha_efectiva": "2026-08-25",
    "concepto": ".",
    "reembolso": False,
    "total_mxp": Decimal("101620.91"),
    "autorizacion": True,
    "autorizado_por": "demo.autoriza@cypcumbres.mx",
    "fecha_autorizacion": "2026-08-25",
    "pagado": True,
    "fecha_pago": "2026-08-24",
    "descripcion_pago": ".",
    "requiere_complemento": False,
    "estado_cfdi": "SIN PENDIENTES DE CFDI",
    "comprobacion_asignada_a": "demo.captura@cypcumbres.mx",
    "aprobacion_lista": False,
    "validacion_estado": "PENDIENTE",
    "permiso_enviar_pago": "N",
    "permiso": "CORP02",
    "created_by": "demo.captura@cypcumbres.mx",
    "updated_by": "demo.captura@cypcumbres.mx",
}


def seed(apps, schema_editor):
    TesoreriaContraparte = apps.get_model("tesoreria", "TesoreriaContraparte")
    TesoreriaCuenta = apps.get_model("tesoreria", "TesoreriaCuenta")
    TesoreriaContrato = apps.get_model("tesoreria", "TesoreriaContrato")
    TesoreriaFlujo = apps.get_model("tesoreria", "TesoreriaFlujo")

    id_contraparte, razon_social = CONTRAPARTE_DEMO
    TesoreriaContraparte.objects.get_or_create(
        id_contraparte=id_contraparte, defaults={"razon_social": razon_social}
    )

    id_cuenta, alias, clabe = CUENTA_DEMO
    TesoreriaCuenta.objects.get_or_create(
        id_cuenta_bancaria=id_cuenta,
        defaults={"banco_id": "DEMO1", "alias": alias, "clabe": clabe, "activa": True, "apertura": "2026-01-01"},
    )

    TesoreriaContrato.objects.get_or_create(
        id_contrato=CONTRATO_DEMO["id_contrato"],
        defaults={
            "sociedad": CONTRATO_DEMO["sociedad"],
            "contraparte_id": id_contraparte,
            "tipo": CONTRATO_DEMO["tipo"],
            "concepto_factura": CONTRATO_DEMO["concepto_factura"],
            "status": CONTRATO_DEMO["status"],
        },
    )

    TesoreriaFlujo.objects.get_or_create(
        id_flujo=FLUJO_DEMO["id_flujo"],
        defaults={**FLUJO_DEMO, "contrato_id": CONTRATO_DEMO["id_contrato"], "cuenta_id": id_cuenta},
    )


def unseed(apps, schema_editor):
    TesoreriaContraparte = apps.get_model("tesoreria", "TesoreriaContraparte")
    TesoreriaCuenta = apps.get_model("tesoreria", "TesoreriaCuenta")
    TesoreriaContrato = apps.get_model("tesoreria", "TesoreriaContrato")
    TesoreriaFlujo = apps.get_model("tesoreria", "TesoreriaFlujo")

    TesoreriaFlujo.objects.filter(id_flujo=FLUJO_DEMO["id_flujo"]).delete()
    TesoreriaContrato.objects.filter(id_contrato=CONTRATO_DEMO["id_contrato"]).delete()
    TesoreriaCuenta.objects.filter(id_cuenta_bancaria=CUENTA_DEMO[0]).delete()
    TesoreriaContraparte.objects.filter(id_contraparte=CONTRAPARTE_DEMO[0]).delete()


class Migration(migrations.Migration):

    dependencies = [
        ("tesoreria", "0004_seed_saldos_demo"),
    ]

    operations = [
        migrations.RunPython(seed, unseed),
    ]
