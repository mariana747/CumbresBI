from django.conf import settings
from django.db import migrations
from django.utils import timezone
import datetime

# Datos de ejemplo para probar /pld y /pld/avisos-uif en local.
# Prefijados "DEMO" - nunca se insertan en Cloud Run (IS_LOCAL_DEV=False).

KYC_DEMO = [
    # (id_kyc, nombre, tipo_persona, sociedad_rfc, estado_cuenta, grado_riesgo, requiere_revision_pld)
    ("demokyc1", "Juan Perez Lopez", "FISICA", "DEMO000001XXX", "ACTIVA", "BAJO", False),
    ("demokyc2", "Inversiones Arco SA de CV", "MORAL", "DEMO000002XXX", "ACTIVA", "MEDIO", True),
    ("demokyc3", "Maria Gonzalez Ruiz", "FISICA", "DEMO000001XXX", "INACTIVA", "ALTO", False),
]

now = timezone.now()

AVISOS_DEMO = [
    # (id_aviso, kyc_id, monto_acumulado, proyecto, sociedad, dias_deteccion, estado)
    # Pendiente dentro de plazo (detectado hace 2h)
    ("dem0av01", "demokyc2", "1250000.00", "RESIDENCIAL LAS CUMBRES", "CIF", -2, "PENDIENTE"),
    # Pendiente vencido (detectado hace 30h)
    ("dem0av02", "demokyc1", "985000.00", "VILLAS DEL BOSQUE", "TIZARA", -30, "PENDIENTE"),
    # Presentado
    ("dem0av03", "demokyc3", "1100000.00", "PARQUE INDUSTRIAL NORTE", "TIZARA", -72, "PRESENTADO"),
]


def seed(apps, schema_editor):
    if getattr(settings, "TESTING", False) or not settings.IS_LOCAL_DEV:
        return
    PldContraparteKyc = apps.get_model("pld", "PldContraparteKyc")
    PldAvisoUIF = apps.get_model("pld", "PldAvisoUIF")

    for id_kyc, nombre, tipo_persona, sociedad_rfc, estado_cuenta, grado_riesgo, requiere_revision in KYC_DEMO:
        PldContraparteKyc.objects.get_or_create(
            id_kyc=id_kyc,
            defaults={
                "nombre_completo": nombre,
                "tipo_persona": tipo_persona,
                "sociedad_rfc": sociedad_rfc,
                "estado_cuenta": estado_cuenta,
                "grado_riesgo": grado_riesgo,
                "requiere_revision_pld": requiere_revision,
            },
        )

    for id_aviso, kyc_id, monto, proyecto, sociedad, horas_deteccion, estado in AVISOS_DEMO:
        fecha_deteccion = now + datetime.timedelta(hours=horas_deteccion)
        plazo = fecha_deteccion + datetime.timedelta(hours=24)
        defaults = {
            "kyc_id": kyc_id,
            "monto_acumulado": monto,
            "proyecto": proyecto,
            "sociedad": sociedad,
            "fecha_deteccion": fecha_deteccion,
            "plazo_presentacion": plazo,
            "estado": estado,
        }
        if estado == "PRESENTADO":
            defaults["fecha_presentacion"] = plazo - datetime.timedelta(hours=1)
            defaults["link_evidencia"] = "https://sicoam.cnbv.gob.mx/demo-evidencia"
        PldAvisoUIF.objects.get_or_create(id_aviso=id_aviso, defaults=defaults)


def unseed(apps, schema_editor):
    PldAvisoUIF = apps.get_model("pld", "PldAvisoUIF")
    PldContraparteKyc = apps.get_model("pld", "PldContraparteKyc")
    PldAvisoUIF.objects.filter(id_aviso__in=[a[0] for a in AVISOS_DEMO]).delete()
    PldContraparteKyc.objects.filter(id_kyc__in=[k[0] for k in KYC_DEMO]).delete()


class Migration(migrations.Migration):

    dependencies = [
        ("pld", "0029_pldavisouif"),
    ]

    operations = [
        migrations.RunPython(seed, unseed),
    ]
