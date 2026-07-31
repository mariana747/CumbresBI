"""Prompts internos por tipo documental, namespaced por servicio consumidor
(docs/architecture/README.md sec. 10: internal_prompt_key). Los campos que se
piden extraer estan alineados a columnas reales de las tablas del ERD
(pld_contrapartes_kyc, pld_contrapartes_docs) para que el resultado se pueda
volcar directo sin inventar nombres de campo nuevos.

Regla comun a todos: si un dato no esta en el documento, el modelo debe
devolver null - nunca inferirlo (ver docs/architecture/README.md sec. 10).
"""

_REGLA_COMUN = (
    "Responde SOLO con JSON valido, sin texto adicional, con esta forma "
    'exacta: {{"detected_document_type": str|null, "confidence": float 0-1, '
    '"extracted_data": object, "validation_errors": [str], "warnings": [str]}}. '
    "Si un dato no esta presente o es ilegible en el documento, usa null en "
    "extracted_data para ese campo - nunca inventes ni infieras un valor. "
    "Si detectas que el documento no corresponde al tipo esperado, dilo en "
    "detected_document_type y agrega un mensaje en warnings."
)

PROMPTS = {
    "generic": (
        "Analiza el documento adjunto y clasificalo. " + _REGLA_COMUN
    ),
    "pld.ine": (
        "El documento es una identificacion oficial (INE/IFE) de una "
        "persona fisica. Extrae en extracted_data: nombre_completo, curp, "
        "fecha_nacimiento (YYYY-MM-DD), domicilio (calle, numero, colonia, "
        "municipio_alcaldia, estado, cp), clave_elector, "
        "numero_identificacion, vigencia (YYYY-MM-DD), tipo_identificacion "
        "('INE'). " + _REGLA_COMUN
    ),
    "pld.acta_nacimiento": (
        "El documento es un acta de nacimiento. Extrae en extracted_data: "
        "nombre_completo, fecha_nacimiento (YYYY-MM-DD), pais_nac_const, "
        "entidad_nacimiento, municipio_nacimiento, nombre_padre, "
        "nombre_madre, curp (si aparece), folio_acta. " + _REGLA_COMUN
    ),
    "pld.acta_constitutiva": (
        "El documento es un acta constitutiva de una persona moral. Extrae "
        "en extracted_data: razon_social, folio_mercantil, objeto_social, "
        "fecha_constitucion (YYYY-MM-DD), rfc (si aparece), "
        "domicilio_social, notario_publico, numero_notaria. " + _REGLA_COMUN
    ),
    "pld.comprobante_domicilio": (
        "El documento es un comprobante de domicilio (recibo de luz, agua, "
        "telefono, estado de cuenta bancario). Extrae en extracted_data: "
        "dom_calle, dom_numero_ext, dom_numero_int, dom_colonia, "
        "dom_municipio_alcaldia, dom_estado, dom_cp, dom_pais, "
        "fecha_comprobante (YYYY-MM-DD), nombre_titular. Agrega a warnings "
        "si la fecha_comprobante tiene mas de 3 meses de antiguedad respecto "
        "a hoy, porque suele invalidarse para KYC. " + _REGLA_COMUN
    ),
    "pld.constancia_fiscal": (
        "El documento es una Constancia de Situacion Fiscal (RFC) emitida "
        "por el SAT. Extrae en extracted_data: rfc, razon_social_o_nombre, "
        "regimen_fiscal, fecha_inicio_operaciones (YYYY-MM-DD), "
        "domicilio_fiscal, curp (si es persona fisica). " + _REGLA_COMUN
    ),
    "compras.cotizacion": (
        "El documento es una cotizacion de un proveedor. Extrae en "
        "extracted_data: proveedor_nombre, proveedor_rfc, "
        "fecha_cotizacion (YYYY-MM-DD), vigencia_dias, moneda, conceptos "
        "(lista de objetos con descripcion, cantidad, precio_unitario, "
        "importe), subtotal, iva, total. " + _REGLA_COMUN
    ),
    "compras.factura_proveedor": (
        "El documento es una factura (CFDI) de un proveedor. Extrae en "
        "extracted_data: uuid, emisor_rfc, emisor_nombre, receptor_rfc, "
        "fecha_emision (YYYY-MM-DD), subtotal, iva, total, moneda, "
        "metodo_pago, forma_pago, uso_cfdi. " + _REGLA_COMUN
    ),
    "materiales.presupuesto": (
        "El documento es un presupuesto de obra o de materiales. Extrae en "
        "extracted_data: proyecto_nombre, fecha_presupuesto (YYYY-MM-DD), "
        "moneda, conceptos (lista de objetos con clave_concepto, "
        "descripcion, unidad, cantidad, precio_unitario, importe), "
        "subtotal, iva, total, vigencia_dias. " + _REGLA_COMUN
    ),
}
