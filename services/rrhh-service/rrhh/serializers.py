from rest_framework import serializers

from .models import RrhhEmpleado, RrhhPuesto


class RrhhEmpleadoSerializer(serializers.ModelSerializer):
    """CRUD de Empleados (10/Sep/2026, Fase 2 del modulo de Nominas - ver
    memoria de sesion "tesoreria-nominas-diseno-09sep") - primer serializer
    real de rrhh-service, hasta ahora solo tenia modelos (ver docstring de
    RrhhEmpleado en models.py). `id_empleado` se genera en el backend si no
    se manda (ver RrhhEmpleadoViewSet.perform_create) - mismo criterio que
    TesoreriaMovimientoBancario._short_id, no tiene valor de negocio legible
    como si lo tienen FLJ-###### o NOM-######."""

    nombre_completo = serializers.SerializerMethodField()

    class Meta:
        model = RrhhEmpleado
        fields = [
            "id_empleado",
            "nombre_completo",
            "apellido_paterno",
            "apellido_materno",
            "nombres",
            "curp",
            "rfc",
            "nss",
            "cta_afore",
            "dom_calle",
            "dom_numero_ext",
            "dom_numero_int",
            "dom_colonia",
            "dom_cp",
            "dom_municipio_alcaldia",
            "dom_estado",
            "estado_civil",
            "fecha_nacimiento",
            "nacimiento_mexico",
            "municipio_nacimiento",
            "estado_nacimiento",
            "lugar_nacimiento_extran",
            "nacionalidad",
            "nombre_padre",
            "nombre_madre",
            "genero",
            "telefono",
            "email",
            "banco",
            "cuenta_banco",
            "tipo_cuenta",
            "link_expediente",
            "estado",
            "created_at",
            "created_by",
            "updated_at",
            "updated_by",
        ]
        read_only_fields = ["id_empleado", "created_at", "updated_at"]

    def get_nombre_completo(self, obj):
        return " ".join(p for p in [obj.nombres, obj.apellido_paterno, obj.apellido_materno] if p)


class RrhhPuestoSerializer(serializers.ModelSerializer):
    """Historial de sueldo (10/Sep/2026, notas de Jenny 09/Sep: "los cambios
    de sueldo se realizan a traves de la tabla Puestos") - NO se edita
    salario_diario en el mismo renglon: se da de baja el Puesto vigente
    (fecha_baja) y se crea uno nuevo con el sueldo actualizado (ver
    RrhhPuestoViewSet.dar_de_baja). El esquema ya soportaba esto (id_puesto
    es su propia PK, 1:N con el empleado) - solo faltaba la pantalla.
    `id_puesto` se genera en el backend igual que id_empleado."""

    empleado_nombre = serializers.SerializerMethodField()

    class Meta:
        model = RrhhPuesto
        fields = [
            "id_puesto",
            "empleado",
            "empleado_nombre",
            "sociedad",
            "supervisor",
            "proyecto",
            "departamento",
            "puesto",
            "factor_integracion",
            "salario_diario",
            "descuentos_isr",
            "descuentos_imss",
            "tipo_salario",
            "turno",
            "umf",
            "fecha_alta",
            "fecha_baja",
            "motivo_fin",
            "tipo_pago",
            "link_alta_imss",
            "link_baja_imss",
            "created_at",
            "created_by",
            "updated_at",
            "updated_by",
        ]
        read_only_fields = ["id_puesto", "created_at", "updated_at"]

    def get_empleado_nombre(self, obj):
        if not obj.empleado:
            return None
        e = obj.empleado
        return " ".join(p for p in [e.nombres, e.apellido_paterno, e.apellido_materno] if p)
