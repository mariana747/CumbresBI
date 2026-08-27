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
    "detected_document_type y agrega un mensaje en warnings. "
    "En extracted_data usa EXCLUSIVAMENTE los nombres de campo en espanol "
    "que se piden explicitamente arriba - no agregues campos adicionales "
    "aunque el documento tenga esa informacion, y nunca uses nombres de "
    "campo ni valores en ingles. En cualquier campo de calle/direccion, "
    "escribe SOLO el nombre de la calle sin abreviaturas ni prefijos como "
    "'C.', 'CALLE', 'AV.', 'AVENIDA' - esos indicadores de tipo de via no "
    "son parte del nombre."
)

PROMPTS = {
    "generic": (
        "Analiza el documento adjunto y clasificalo. " + _REGLA_COMUN
    ),
    "pld.ine": (
        "El documento es una identificacion oficial (INE/IFE) de una "
        "persona fisica. Extrae en extracted_data (campos PLANOS, nunca "
        "un objeto anidado de domicilio - ver nombres exactos): "
        "nombre_completo, curp, fecha_nac_const (YYYY-MM-DD, fecha de "
        "nacimiento), dom_calle, dom_numero_ext, dom_numero_int (si "
        "aparece), dom_colonia, dom_municipio_alcaldia, dom_estado, "
        "dom_cp, clave_elector, numero_identificacion (el CIC/numero de "
        "identificacion del ciudadano impreso junto a la fotografia, NO la "
        "clave de elector), vigencia (YYYY-MM-DD), tipo_identificacion "
        "('INE'). " + _REGLA_COMUN
    ),
    "pld.curp": (
        "El documento es una constancia de CURP (Clave Unica de Registro de "
        "Poblacion) emitida por RENAPO. Extrae en extracted_data unicamente: "
        "nombre_completo, curp, entidad_registro (la entidad federativa que "
        "registro la CURP, distinta de la entidad de nacimiento). No "
        "incluyas fecha_nacimiento, sexo ni entidad_nacimiento - esos datos "
        "van codificados en la propia CURP y no se piden como campos "
        "separados. " + _REGLA_COMUN
    ),
    "pld.acta_nacimiento": (
        "El documento es un acta de nacimiento. Extrae en extracted_data: "
        "nombre_completo, fecha_nac_const (YYYY-MM-DD, fecha de "
        "nacimiento), pais_nac_const, entidad_nacimiento, "
        "municipio_nacimiento, nombre_padre, nombre_madre, curp (si "
        "aparece), folio_acta. " + _REGLA_COMUN
    ),
    "pld.acta_constitutiva": (
        "El documento es un acta constitutiva de una persona moral. Extrae "
        "en extracted_data: razon_social, folio_mercantil, objeto_social, "
        "fecha_nac_const (YYYY-MM-DD, fecha de constitucion), rfc (si "
        "aparece), domicilio_social, notario_publico, numero_notaria. "
        + _REGLA_COMUN
    ),
    "pld.comprobante_domicilio": (
        "El documento es un comprobante de domicilio (recibo de luz, agua, "
        "telefono, estado de cuenta bancario). Extrae en extracted_data "
        "unicamente: dom_calle, dom_numero_ext, dom_numero_int, dom_colonia, "
        "dom_municipio_alcaldia, dom_estado, dom_cp, dom_pais, "
        "fecha_comprobante (YYYY-MM-DD), nombre_titular. NO incluyas el "
        "periodo de facturacion (billing period) ni el monto a pagar - no "
        "son relevantes para validar domicilio. Agrega a warnings si la "
        "fecha_comprobante tiene mas de 3 meses de antiguedad respecto a "
        "hoy, porque suele invalidarse para KYC. " + _REGLA_COMUN
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
    "tesoreria.cfdi_factura": (
        "El documento es una factura (CFDI) recibida de un proveedor. Extrae "
        "en extracted_data, con estos nombres exactos (columnas reales de "
        "tesoreria_facturas, ver services/tesoreria-service/tesoreria/"
        "models.py::TesoreriaFactura): timbre_uuid (el folio fiscal/UUID del "
        "timbrado, NO el UUID de un CFDI relacionado), comprobante_serie, "
        "comprobante_folio, comprobante_fecha (YYYY-MM-DD), "
        "comprobante_moneda, comprobante_forma_pago (clave SAT, ej. '01'), "
        "comprobante_metodo_pago ('PUE' o 'PPD'), comprobante_total, "
        "comprobante_tipo_de_comprobante (catalogo c_TipoDeComprobante del "
        "SAT: 'I' Ingreso, 'E' Egreso, 'P' Pago, 'N' Nomina, 'T' Traslado - "
        "una factura de proveedor casi siempre es 'I'), tipo_relacion "
        "(clave del catalogo c_TipoRelacion si el CFDI declara nodo "
        "CfdiRelacionados, ej. '01' o '04', null si no aplica), "
        "uuid_relacionado (el primer UUID del nodo CfdiRelacionados si "
        "existe, null si no aplica), "
        "emisor_rfc, emisor_nombre, receptor_rfc, receptor_nombre, "
        "receptor_uso_cfdi (clave SAT, ej. 'G03'), timbre_fecha_timbrado "
        "(YYYY-MM-DD HH:MM:SS). " + _REGLA_COMUN
    ),
    "materiales.presupuesto": (
        "El documento es un presupuesto de obra o de materiales. Extrae en "
        "extracted_data: proyecto_nombre, fecha_presupuesto (YYYY-MM-DD), "
        "moneda, conceptos (lista de objetos con clave_concepto, "
        "descripcion, unidad, cantidad, precio_unitario, importe), "
        "subtotal, iva, total, vigencia_dias. " + _REGLA_COMUN
    ),
    # 27/Ago/2026, pedido de Mariana: antes de aprobar un ticket de
    # reembolso de MiCumbres, Tesoreria verifica con el Motor Documental el
    # comprobante/foto que subio el propio empleado (no la factura formal,
    # esa se sube despues, ya aprobado - ver TesoreriaTicketReembolso). Los
    # nombres de campo no corresponden a ninguna tabla real: solo sirven
    # para que el analista compare contra lo que el empleado ya declaro
    # (descripcion/monto/fecha_gasto), nunca se guardan.
    "tesoreria.ticket_gasto": (
        "El documento es un ticket, recibo o comprobante de un gasto de "
        "reembolso (viatico, gasolina, comida, hospedaje, etc.) subido por "
        "un empleado. Extrae en extracted_data: comercio_nombre, "
        "fecha_gasto (YYYY-MM-DD), monto_total, moneda, concepto (una "
        "descripcion breve de que fue el gasto). " + _REGLA_COMUN
    ),
}
