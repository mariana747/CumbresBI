from django.db import models


class RrhhEmpleado(models.Model):
    """id_empleado es varchar(255) y no autogenerado: viene del sistema de
    origen (AppSheet heredado), a diferencia de los ids cortos de 8 caracteres
    usados en iam-service. iam_users.employee_id referencia esta PK desde
    iam-service (fuera de este esquema, no es ForeignKey real aqui tampoco -
    la relacion inversa vive del lado de iam-service).
    """

    CIVIL_SOLTERO = "SOLTERO"
    CIVIL_CASADO = "CASADO"
    ESTADO_CIVIL_CHOICES = [
        (CIVIL_SOLTERO, "Soltero"),
        (CIVIL_CASADO, "Casado"),
    ]

    GENERO_MUJER = "MUJER"
    GENERO_HOMBRE = "HOMBRE"
    GENERO_CHOICES = [
        (GENERO_MUJER, "Mujer"),
        (GENERO_HOMBRE, "Hombre"),
    ]

    id_empleado = models.CharField(max_length=255, primary_key=True)
    apellido_paterno = models.CharField(max_length=100, blank=True, null=True)
    apellido_materno = models.CharField(max_length=100, blank=True, null=True)
    nombres = models.CharField(max_length=100, blank=True, null=True)
    curp = models.CharField(max_length=18, blank=True, null=True)
    rfc = models.CharField(max_length=13, blank=True, null=True)
    nss = models.CharField(max_length=11, blank=True, null=True)
    cta_afore = models.CharField(max_length=50, blank=True, null=True)
    dom_calle = models.CharField(max_length=150, blank=True, null=True)
    dom_numero_ext = models.CharField(max_length=50, blank=True, null=True)
    dom_numero_int = models.CharField(max_length=50, blank=True, null=True)
    dom_colonia = models.CharField(max_length=100, blank=True, null=True)
    dom_cp = models.CharField(max_length=10, blank=True, null=True)
    dom_municipio_alcaldia = models.CharField(max_length=255, blank=True, null=True)
    dom_estado = models.CharField(max_length=255, blank=True, null=True)
    estado_civil = models.CharField(
        max_length=20, choices=ESTADO_CIVIL_CHOICES, blank=True, null=True
    )
    fecha_nacimiento = models.DateField(blank=True, null=True)
    nacimiento_mexico = models.BooleanField(blank=True, null=True)
    municipio_nacimiento = models.CharField(max_length=255, blank=True, null=True)
    estado_nacimiento = models.CharField(max_length=255, blank=True, null=True)
    lugar_nacimiento_extran = models.TextField(blank=True, null=True)
    nacionalidad = models.CharField(max_length=255, blank=True, null=True)
    nombre_padre = models.CharField(max_length=100, blank=True, null=True)
    nombre_madre = models.CharField(max_length=100, blank=True, null=True)
    genero = models.CharField(max_length=20, choices=GENERO_CHOICES, blank=True, null=True)
    telefono = models.CharField(max_length=10, blank=True, null=True)
    email = models.CharField(max_length=100, blank=True, null=True)
    banco = models.CharField(max_length=255, blank=True, null=True)
    cuenta_banco = models.CharField(max_length=18, blank=True, null=True)
    tipo_cuenta = models.CharField(max_length=255, blank=True, null=True)
    link_expediente = models.TextField(blank=True, null=True)
    estado = models.CharField(max_length=10, blank=True, null=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)
    created_by = models.CharField(max_length=100, blank=True, null=True)
    updated_by = models.CharField(max_length=100, blank=True, null=True)

    class Meta:
        db_table = "rrhh_empleados"

    def __str__(self):
        return f"{self.id_empleado} - {self.nombres} {self.apellido_paterno}"


class RrhhPuesto(models.Model):
    """sociedad referencia general_sociedades.rfc (iam-service, fuera de este
    esquema) - se guarda como CharField plano, no ForeignKey real, mismo
    criterio de aislamiento documentado en docs/architecture/README.md
    sec. 11.2 #1.
    """

    id_puesto = models.CharField(max_length=255, primary_key=True)
    empleado = models.ForeignKey(
        RrhhEmpleado,
        db_column="id_empleado",
        on_delete=models.CASCADE,
        related_name="puestos",
        blank=True,
        null=True,
    )
    sociedad = models.CharField(max_length=13, blank=True, null=True)
    supervisor = models.ForeignKey(
        RrhhEmpleado,
        db_column="id_supervisor",
        on_delete=models.SET_NULL,
        related_name="supervisados",
        blank=True,
        null=True,
    )
    proyecto = models.CharField(max_length=3, blank=True, null=True)
    departamento = models.CharField(max_length=255, blank=True, null=True)
    puesto = models.CharField(max_length=100, blank=True, null=True)
    factor_integracion = models.DecimalField(
        max_digits=9, decimal_places=6, blank=True, null=True
    )
    salario_diario = models.DecimalField(max_digits=14, decimal_places=2, blank=True, null=True)
    descuentos_isr = models.DecimalField(max_digits=14, decimal_places=2, blank=True, null=True)
    descuentos_imss = models.DecimalField(max_digits=14, decimal_places=2, blank=True, null=True)
    tipo_salario = models.CharField(max_length=255, blank=True, null=True)
    turno = models.CharField(max_length=255, blank=True, null=True)
    umf = models.DecimalField(max_digits=14, decimal_places=2, blank=True, null=True)
    fecha_alta = models.DateField(blank=True, null=True)
    fecha_baja = models.DateField(blank=True, null=True)
    motivo_fin = models.CharField(max_length=255, blank=True, null=True)
    tipo_pago = models.CharField(max_length=255, blank=True, null=True)
    link_alta_imss = models.CharField(max_length=2083, blank=True, null=True)
    link_baja_imss = models.CharField(max_length=2083, blank=True, null=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)
    created_by = models.CharField(max_length=100, blank=True, null=True)
    updated_by = models.CharField(max_length=100, blank=True, null=True)

    class Meta:
        db_table = "rrhh_puestos"

    def __str__(self):
        return self.id_puesto
