"""Catalogo de servicios/roles/permisos confirmado por el cliente
(docs/architecture/roles-y-permisos.md sec. 3). Extraido de
iam/migrations/0004_seed_permisos_matriz.py (11/Ago/2026) a un modulo
normal en vez de vivir solo dentro de la migracion, para que el frontend
(fixture de pruebas, ver frontend/src/components/__tests__/fixtures/
roleAccessMatrix.json) y cualquier otro consumidor futuro tengan una sola
fuente de verdad en vez de copiar el dict a mano - antes solo la migracion
lo conocia.

Nota: una migracion que importa codigo de la app "vivo" (no congelado en
el momento de la migracion) es la excepcion, no la regla en Django - se
acepta aqui a proposito porque este dict es un catalogo de negocio
estable (roles/permisos confirmados por el cliente), no un modelo que
vaya a mutar de forma incompatible; si algun dia cambia retroactivamente
el comportamiento historico de esta migracion seria aceptable (mismo
riesgo que ya existia teniendo el dict inline, solo que ahora tambien lo
lee alguien mas).

L=leer, C=crear, E=editar, A=aprobar/autorizar. Simplificaciones
documentadas caso por caso:
- TICKETS_PARTICIPANTE: el doc distingue "L solo lo asignado a mi" de
  "C solo comentarios" - aqui se modela como LC llano sobre "tickets", sin
  ese matiz de alcance por registro (lo resuelve RLS, no el catalogo de
  permisos).
"""

SERVICIOS = [
    "iam",
    "contrapartes",
    "pld-compliance",
    "ventas-vivienda",
    "materiales",
    "rentas",
    "tesoreria",
    "facturacion-cfdi",
    "compras",
    "rrhh",
    "tickets",
    "audit",
    # Obra (obra-service, 21/Ago/2026) - avance de obra semanal, reusa
    # vista/nomenclatura del Excel legado (ver obra-vista-excel-y-envio-
    # viernes en memoria del proyecto). PENDIENTE confirmar con el cliente
    # igual que el resto de este catalogo - agregado aqui como default
    # razonable para no bloquear el scaffold, no como definitivo.
    "obra",
    # Motor Documental (document-intelligence-service) - transversal, no es
    # negocio de un solo modulo (PLD hoy, compras/tesoreria/rrhh a futuro
    # via SERVICIOS_SOLICITANTES en el frontend). "C"=encolar un analisis
    # nuevo (docint.crear), "L"=consultar su estado/resultado (docint.leer,
    # GET /analyze/<id>/status) - mismo criterio letra->accion que el resto,
    # sin inventar una accion nueva (13/Ago/2026, fase 4 de la migracion
    # async con Cloud Tasks).
    "docint",
    # Archivos del expediente KYC (pld-service, 25/Ago/2026 - requerimiento
    # real del cliente: "nadie modifica en Drive, todo desde CumbresBI").
    # Separado de "pld-compliance" a proposito: antes agregar/eliminar un
    # documento y editar los datos escritos del expediente compartian el
    # mismo perm_key (pld-compliance.crear/editar), asi que el analista
    # podia hacer ambas cosas. Ahora solo Admin (SUPER_ADMIN) gestiona
    # archivos (subir/eliminar); el analista conserva pld-compliance.editar
    # para los datos, pero solo "L" aqui (ve los documentos, no los toca).
    # PLD_APROBADOR no se toca (su rol es aprobar/rechazar el expediente,
    # no gestionar archivos - eso todavia no esta contemplado).
    "pld-documentos",
]

ACCION_POR_LETRA = {"L": "leer", "C": "crear", "E": "editar", "A": "aprobar"}

ROLE_ACCESS = {
    "SUPER_ADMIN": {
        "iam": "LCEA", "contrapartes": "LCEA", "pld-compliance": "LCEA",
        "ventas-vivienda": "LCEA", "materiales": "LCEA", "rentas": "LCEA",
        "tesoreria": "LCEA", "facturacion-cfdi": "LCEA", "compras": "LCEA",
        "rrhh": "LCEA", "tickets": "LCEA", "audit": "L", "docint": "LC", "obra": "LCEA",
        "pld-documentos": "LCEA",
    },
    "IAM_ADMIN": {"iam": "LCEA", "audit": "L"},
    "AUDITOR": {s: "L" for s in SERVICIOS},
    "PLD_ANALISTA": {
        "iam": "L", "contrapartes": "L", "pld-compliance": "LCE", "docint": "LC",
        "pld-documentos": "L",
    },
    "PLD_APROBADOR": {"iam": "L", "contrapartes": "L", "pld-compliance": "LEA", "docint": "LC"},
    "VENTAS_ASESOR": {
        "iam": "L", "contrapartes": "L", "ventas-vivienda": "LCE", "materiales": "L",
    },
    "VENTAS_GERENTE": {
        "iam": "L", "contrapartes": "L", "ventas-vivienda": "LCEA",
        "materiales": "LE", "tesoreria": "L",
    },
    "OBRA_COORDINADOR": {"iam": "L", "ventas-vivienda": "LE", "materiales": "LCE", "obra": "LCE"},
    # SUPERVISOR_OBRA (21/Ago/2026, PENDIENTE confirmar con el cliente): rol
    # mencionado por Mariana para el corte semanal de obra - captura y
    # aprueba/cierra el corte del viernes (obra.aprobar), a diferencia de
    # OBRA_COORDINADOR que no tiene la "A". Alcance PROYECTO.
    "SUPERVISOR_OBRA": {"iam": "L", "obra": "LCEA"},
    "FINANZAS_MANAGER": {
        "iam": "L", "contrapartes": "LCE", "ventas-vivienda": "L", "materiales": "L",
        "rentas": "LCE", "tesoreria": "LCEA", "facturacion-cfdi": "LCE", "compras": "LCEA",
    },
    "TESORERIA_ANALISTA": {
        "iam": "L", "contrapartes": "L", "tesoreria": "LCE", "facturacion-cfdi": "LC",
    },
    "COMPRAS_ANALISTA": {
        "iam": "L", "contrapartes": "L", "materiales": "LCE", "tesoreria": "L", "compras": "LCEA",
    },
    "CONTRALOR": {
        "iam": "L", "contrapartes": "L", "ventas-vivienda": "L", "materiales": "L",
        "rentas": "L", "tesoreria": "L", "facturacion-cfdi": "L", "compras": "L", "audit": "L",
    },
    "RRHH_SUPERVISOR_CENTRO": {"iam": "L", "rrhh": "LE"},
    "RRHH_ADMIN": {"iam": "L", "rrhh": "LCEA"},
    "EMPLEADO_SELF": {"rrhh": "L", "tickets": "L"},
    "TICKETS_RESPONSABLE": {"iam": "L", "tickets": "LCEA"},
    "TICKETS_PARTICIPANTE": {"tickets": "LC"},
}


def perm_keys_de(role_key: str) -> list[str]:
    """perm_keys ("iam.leer", "pld-compliance.aprobar", etc.) de un rol -
    mismo criterio que _perm_keys()/seed() en la migracion 0004, expuesto
    aqui para que dev_views.py (switch de rol sin Google) y cualquier
    script/test lo reutilicen sin reimplementar el cruce letra->accion."""
    accesos = ROLE_ACCESS[role_key]
    return sorted(
        f"{servicio}.{ACCION_POR_LETRA[letra]}"
        for servicio, letras in accesos.items()
        for letra in letras
    )
