"""Rellena EMPLEADOS y PUESTOS en la migración 0002_seed_empleados_legacy.py
a partir de los CSV exportados de Cloud SQL Studio.

Uso:
    python docs/seed_rrhh_legacy.py

Los CSV deben estar en docs/Datos/:
    studio_results_20261001_1620.csv        -> empleados
    studio_results_20261001_1620 (1).csv   -> puestos
"""
import csv
import ast
import pathlib
import re

BASE = pathlib.Path(__file__).parent
DATOS = BASE / "Datos"
MIGRATION = BASE.parent / "services/rrhh-service/rrhh/migrations/0002_seed_empleados_legacy.py"

EMP_CSV = DATOS / "studio_results_20261001_1620.csv"
PUE_CSV = DATOS / "studio_results_20261001_1620 (1).csv"


def v(x):
    return None if x in ("", "-", "NULL", "None") else x


def vb(x):
    return True if x in ("1", "True", "true") else (False if x in ("0", "False", "false", "", "-") else None)


def vd(x):
    return None if not x or x in ("", "-", "0000-00-00") else x[:10]


with open(EMP_CSV, encoding="utf-8") as f:
    empleados = [
        {
            "id_empleado": e["id_empleado"],
            "apellido_paterno": v(e["apellido_paterno"]),
            "apellido_materno": v(e["apellido_materno"]),
            "nombres": v(e["nombres"]),
            "curp": v(e["curp"]),
            "rfc": v(e["rfc"]),
            "nss": v(e["nss"]),
            "cta_afore": v(e["cta_afore"]),
            "dom_calle": v(e["dom_calle"]),
            "dom_numero_ext": v(e["dom_numero_ext"]),
            "dom_numero_int": v(e["dom_numero_int"]),
            "dom_colonia": v(e["dom_colonia"]),
            "dom_cp": v(e["dom_cp"]),
            "dom_municipio_alcaldia": v(e["dom_municipio_alcaldia"]),
            "dom_estado": v(e["dom_estado"]),
            "estado_civil": v(e["estado_civil"]),
            "fecha_nacimiento": vd(e["fecha_nacimiento"]),
            "nacimiento_mexico": vb(e["nacimiento_mexico"]),
            "municipio_nacimiento": v(e["municipio_nacimiento"]),
            "estado_nacimiento": v(e["estado_nacimiento"]),
            "lugar_nacimiento_extran": v(e["lugar_nacimiento_extran"]),
            "nacionalidad": v(e["nacionalidad"]),
            "nombre_padre": v(e["nombre_padre"]),
            "nombre_madre": v(e["nombre_madre"]),
            "genero": v(e["genero"]),
            "telefono": v(e["telefono"]),
            "email": v(e["email"]),
            "banco": v(e["banco"]),
            "cuenta_banco": v(e["cuenta_banco"]),
            "tipo_cuenta": v(e["tipo_cuenta"]),
            "link_expediente": v(e["link_expediente"]),
            "estado": v(e["estado"]),
        }
        for e in csv.DictReader(f)
    ]

with open(PUE_CSV, encoding="utf-8") as f:
    puestos = [
        {
            "id_puesto": p["id_puesto"],
            "id_empleado": p["id_empleado"],
            "id_supervisor": v(p["id_supervisor"]),
            "sociedad": v(p["sociedad"]),
            "proyecto": v(p["proyecto"]),
            "departamento": v(p["departamento"]),
            "puesto": v(p["puesto"]),
            "factor_integracion": v(p["factor_integracion"]),
            "salario_diario": v(p["salario_diario"]),
            "descuentos_isr": v(p["descuentos_isr"]),
            "descuentos_imss": v(p["descuentos_imss"]),
            "tipo_salario": v(p["tipo_salario"]),
            "turno": v(p["turno"]),
            "umf": v(p["umf"]),
            "fecha_alta": vd(p["fecha_alta"]),
            "fecha_baja": vd(p["fecha_baja"]),
            "motivo_fin": v(p["motivo_fin"]),
            "tipo_pago": v(p["tipo_pago"]),
            "link_alta_imss": v(p["link_alta_imss"]),
            "link_baja_imss": v(p["link_baja_imss"]),
        }
        for p in csv.DictReader(f)
    ]

emp_repr = "[\n    " + ",\n    ".join(repr(e) for e in empleados) + ",\n]"
pue_repr = "[\n    " + ",\n    ".join(repr(p) for p in puestos) + ",\n]"

texto = MIGRATION.read_text(encoding="utf-8")
texto = re.sub(r"EMPLEADOS = \[\].*?# poblado por seed_rrhh_legacy\.py",
               f"EMPLEADOS = {emp_repr}",
               texto, flags=re.DOTALL)
texto = re.sub(r"PUESTOS = \[\].*?# poblado por seed_rrhh_legacy\.py",
               f"PUESTOS = {pue_repr}",
               texto, flags=re.DOTALL)

MIGRATION.write_text(texto, encoding="utf-8")
print(f"Migración actualizada: {len(empleados)} empleados, {len(puestos)} puestos.")
