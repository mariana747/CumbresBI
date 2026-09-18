-- ============================================================
-- MIGRACIÓN LEGACY administracion -> cumbresbi_tesoreria_service
-- Preparado 18/Sep/2026. Ejecutar bloque por bloque en Cloud SQL Studio,
-- en este orden (respeta FKs reales). Requiere que tesoreria_bancos y
-- general_sociedades ya estén migradas (ya lo están).
-- ============================================================

-- ------------------------------------------------------------
-- 0. Verificación previa: bloqueante de tesoreria_flujos.id_contrato
-- ------------------------------------------------------------
SELECT COUNT(*) AS flujos_sin_contrato
FROM administracion.tesoreria_flujos
WHERE id_contrato IS NULL;
-- Si el resultado es > 0: DETENERSE. TesoreriaFlujo.contrato es NOT NULL
-- en el modelo real; no hay valor seguro que inventar. Resolver a mano
-- (probablemente asignando el contrato genérico correcto por sociedad)
-- antes de seguir con el bloque 10 (tesoreria_flujos).

-- ------------------------------------------------------------
-- 1. tesoreria_cuentas
--    NOTA: 'CHEQUES' explícito en `tipo` porque la columna es NOT NULL
--    en el modelo (default de la app, ninguna cuenta legacy tenía tipo).
--    Sin columnas de auditoría en el legacy -> NOW()/NULL, mismo
--    criterio que bancos.
-- ------------------------------------------------------------
INSERT INTO cumbresbi_tesoreria_service.tesoreria_cuentas
    (id_cuenta_bancaria, rfc_razon_social, sociedad, tipo, banco, cuenta,
     clabe, alias, label, activa, apertura, cierre,
     created_at, created_by, updated_at, updated_by)
SELECT
    id_cuenta_bancaria, rfc_razon_social, NULL, 'CHEQUES', banco, cuenta,
    clabe, alias, label, activa, apertura, cierre,
    NOW(), NULL, NOW(), NULL
FROM administracion.tesoreria_cuentas;

-- ------------------------------------------------------------
-- 2. tesoreria_contrapartes
--    origen -> 'manual' (decidido). fusionado_en -> NULL (decidido).
--    Confirmado sin RFCs duplicados en legacy, no hace falta dedup.
-- ------------------------------------------------------------
INSERT INTO cumbresbi_tesoreria_service.tesoreria_contrapartes
    (rfc, id_contraparte, razon_social, contacto, telefono_sms, email,
     origen, comentarios, permiso, created_at, created_by, updated_at,
     updated_by, autorizado_por, apellido_paterno, apellido_materno,
     tipo_persona, genero, cliente, proveedor, fusionado_en)
SELECT
    rfc, id_contraparte, razon_social, contacto, telefono_sms, email,
    'manual', comentarios, permiso, IFNULL(created_at, NOW()), created_by, IFNULL(updated_at, NOW()),
    updated_by, autorizado_por, apellido_paterno, apellido_materno,
    tipo_persona, genero, cliente, proveedor, NULL
FROM administracion.tesoreria_contrapartes;

-- ------------------------------------------------------------
-- 3. tesoreria_contratos
--    categoria -> NULL (decidido, sin backfill).
-- ------------------------------------------------------------
-- Verificación de huérfanos antes de insertar (contraparte es FK real PROTECT):
SELECT c.id_contrato, c.id_contraparte
FROM administracion.tesoreria_contratos c
LEFT JOIN administracion.tesoreria_contrapartes cp ON cp.id_contraparte = c.id_contraparte
WHERE cp.id_contraparte IS NULL;
-- Si regresa filas: esos contratos no se pueden insertar hasta resolver
-- la contraparte faltante (dato inconsistente del legacy).

INSERT INTO cumbresbi_tesoreria_service.tesoreria_contratos
    (id_contrato, categoria, fecha_generacion, fecha_vencimiento, tipo,
     id_contraparte, sociedad, proyecto, propiedad, centro, tipo_pago,
     frecuencia, duracion, fecha_proyectada, moneda, monto_periodo_iva_mxp,
     monto_total_iva_mxp, concepto_factura, link_carpeta, link_contrato,
     requiere_factura, comentarios, status, permiso, created_at, created_by,
     updated_at, updated_by, autorizacion)
SELECT
    id_contrato, NULL, IF(fecha_generacion + 0 = 0, NULL, fecha_generacion),
    IF(fecha_vencimiento + 0 = 0, NULL, fecha_vencimiento), tipo,
    id_contraparte, sociedad, proyecto, propiedad, centro, tipo_pago,
    frecuencia, duracion, IF(fecha_proyectada + 0 = 0, NULL, fecha_proyectada), moneda,
    monto_periodo_iva_mxp,
    monto_total_iva_mxp, concepto_factura, link_carpeta, link_contrato,
    requiere_factura, comentarios, status, permiso, created_at, created_by,
    updated_at, updated_by, autorizacion
FROM administracion.tesoreria_contratos;

-- ------------------------------------------------------------
-- 4. tesoreria_saldos (1:1 directo, sin columnas de auditoría en legacy)
-- ------------------------------------------------------------
INSERT INTO cumbresbi_tesoreria_service.tesoreria_saldos
    (id, fecha, cuenta, saldo, cambio_dinero, cambio_porcentual,
     created_at, created_by, updated_at, updated_by)
SELECT
    id, fecha, cuenta, saldo, cambio_dinero, cambio_porcentual,
    NOW(), NULL, NOW(), NULL
FROM administracion.tesoreria_saldos;

-- ------------------------------------------------------------
-- 5. tesoreria_contrapartes_relacion (1:1 directo)
-- ------------------------------------------------------------
INSERT INTO cumbresbi_tesoreria_service.tesoreria_contrapartes_relacion
    (id_relacion, id_contraparte, id_contraparte_relacion, tipo_relacion,
     created_at, created_by, updated_at, updated_by)
SELECT
    id_relacion, id_contraparte, id_contraparte_relacion, tipo_relacion,
    IFNULL(created_at, NOW()), created_by, IFNULL(updated_at, NOW()), updated_by
FROM administracion.tesoreria_contrapartes_relacion;

-- ------------------------------------------------------------
-- 6. tesoreria_facturas
--    id_contraparte no existe en el legacy -> se resuelve en el UPDATE
--    del bloque 12. ticket_origen_id/categoria_gasto/comprobante_iva/
--    link_xml/drive_file_id_*/mime_type_* -> NULL (no hay fuente legacy).
--    `id` se copia igual (AutoField) para preservar el mismo PK que usan
--    factura_uuid en Flujos y UUID_Relacionado en NotasCredito.
-- ------------------------------------------------------------
INSERT INTO cumbresbi_tesoreria_service.tesoreria_facturas
    (id, id_contraparte, ticket_origen_id, categoria_gasto,
     Comprobante_Version, Comprobante_Serie, Comprobante_Folio,
     Comprobante_Fecha, Comprobante_FormaPago, Comprobante_NoCertificado,
     Comprobante_SubTotal, Comprobante_IVA, Comprobante_Moneda,
     Comprobante_Exportacion, Comprobante_TipoCambio, Comprobante_Total,
     Comprobante_TipoDeComprobante, Comprobante_MetodoPago,
     Comprobante_LugarExpedicion, TipoRelacion, UUID_Relacionado,
     Emisor_Rfc, Emisor_Nombre, Emisor_RegimenFiscal, Receptor_Rfc,
     Receptor_Nombre, Receptor_DomicilioFiscalReceptor,
     Receptor_RegimenFiscalReceptor, Receptor_UsoCFDI, Timbre_Version,
     Timbre_UUID, Timbre_FechaTimbrado, Timbre_RfcProvCertif,
     Timbre_NoCertificadoSAT, tipo_factura, link_pdf, drive_file_id_pdf,
     mime_type_pdf, link_xml, drive_file_id_xml, mime_type_xml,
     created_at, created_by, updated_at, updated_by, estado)
SELECT
    id, NULL, NULL, NULL,
    Comprobante_Version, Comprobante_Serie, Comprobante_Folio,
    IF(Comprobante_Fecha + 0 = 0, NULL, Comprobante_Fecha), Comprobante_FormaPago, Comprobante_NoCertificado,
    Comprobante_SubTotal, NULL, Comprobante_Moneda,
    Comprobante_Exportacion, Comprobante_TipoCambio, Comprobante_Total,
    Comprobante_TipoDeComprobante, Comprobante_MetodoPago,
    Comprobante_LugarExpedicion, TipoRelacion, UUID_Relacionado,
    Emisor_Rfc, Emisor_Nombre, Emisor_RegimenFiscal, Receptor_Rfc,
    Receptor_Nombre, Receptor_DomicilioFiscalReceptor,
    Receptor_RegimenFiscalReceptor, Receptor_UsoCFDI, Timbre_Version,
    Timbre_UUID, IF(Timbre_FechaTimbrado + 0 = 0, NULL, Timbre_FechaTimbrado), Timbre_RfcProvCertif,
    Timbre_NoCertificadoSAT, tipo_factura, link_pdf, NULL,
    NULL, NULL, NULL, NULL,
    created_at, created_by, updated_at, updated_by, estado
FROM administracion.tesoreria_facturas;

-- Resincroniza el AUTO_INCREMENT tras insertar ids explícitos:
SET @next_id = (SELECT IFNULL(MAX(id), 0) + 1 FROM cumbresbi_tesoreria_service.tesoreria_facturas);
SET @sql = CONCAT('ALTER TABLE cumbresbi_tesoreria_service.tesoreria_facturas AUTO_INCREMENT = ', @next_id);
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

-- ------------------------------------------------------------
-- 7. factura_conceptos / factura_doctos_relacionados /
--    factura_notas_credito / factura_traslados (1:1 directo)
-- ------------------------------------------------------------
INSERT INTO cumbresbi_tesoreria_service.factura_conceptos
    (id, UUID, ClaveProdServ, NoIdentificacion, Cantidad, ClaveUnidad,
     Unidad, Descripcion, ValorUnitario, Importe, Descuento, ObjetoImp,
     created_at, updated_at, created_by, updated_by, rfc_propietario)
SELECT
    id, UUID, ClaveProdServ, NoIdentificacion, Cantidad, ClaveUnidad,
    Unidad, Descripcion, ValorUnitario, Importe, Descuento, ObjetoImp,
    IFNULL(created_at, NOW()), IFNULL(updated_at, NOW()), created_by, updated_by, rfc_propietario
FROM administracion.factura_conceptos;
SET @next_id = (SELECT IFNULL(MAX(id), 0) + 1 FROM cumbresbi_tesoreria_service.factura_conceptos);
SET @sql = CONCAT('ALTER TABLE cumbresbi_tesoreria_service.factura_conceptos AUTO_INCREMENT = ', @next_id);
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

INSERT INTO cumbresbi_tesoreria_service.factura_doctos_relacionados
    (id, Timbre_UUID, IdDocumento, Serie, Folio, MonedaDR, EquivalenciaDR,
     NumParcialidad, ImpSaldoAnt, ImpPagado, ImpSaldoInsoluto, ObjetoImpDR,
     created_at, updated_at, created_by, updated_by, rfc_propietario)
SELECT
    id, Timbre_UUID, IdDocumento, Serie, Folio, MonedaDR, EquivalenciaDR,
    NumParcialidad, ImpSaldoAnt, ImpPagado, ImpSaldoInsoluto, ObjetoImpDR,
    IFNULL(created_at, NOW()), IFNULL(updated_at, NOW()), created_by, updated_by, rfc_propietario
FROM administracion.factura_doctos_relacionados;
SET @next_id = (SELECT IFNULL(MAX(id), 0) + 1 FROM cumbresbi_tesoreria_service.factura_doctos_relacionados);
SET @sql = CONCAT('ALTER TABLE cumbresbi_tesoreria_service.factura_doctos_relacionados AUTO_INCREMENT = ', @next_id);
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

INSERT INTO cumbresbi_tesoreria_service.factura_notas_credito
    (id, uuid, uuid_relacionado, ClaveProdServ, NoIdentificacion, Cantidad,
     ClaveUnidad, Unidad, Descripcion, ValorUnitario, Importe, ObjetoImp,
     Base, Impuesto, TipoFactor, TasaOCuota, ImporteTraslado,
     TotalImpuestosTrasladados, created_at, updated_at, created_by,
     updated_by, rfc_propietario)
SELECT
    id, uuid, uuid_relacionado, ClaveProdServ, NoIdentificacion, Cantidad,
    ClaveUnidad, Unidad, Descripcion, ValorUnitario, Importe, ObjetoImp,
    Base, Impuesto, TipoFactor, TasaOCuota, ImporteTraslado,
    TotalImpuestosTrasladados, IFNULL(created_at, NOW()), IFNULL(updated_at, NOW()), created_by,
    updated_by, rfc_propietario
FROM administracion.factura_notas_credito;
SET @next_id = (SELECT IFNULL(MAX(id), 0) + 1 FROM cumbresbi_tesoreria_service.factura_notas_credito);
SET @sql = CONCAT('ALTER TABLE cumbresbi_tesoreria_service.factura_notas_credito AUTO_INCREMENT = ', @next_id);
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

INSERT INTO cumbresbi_tesoreria_service.factura_traslados
    (id, UUID, Base, Impuesto, TipoFactor, TasaOCuota, Importe,
     created_at, updated_at, created_by, updated_by, rfc_propietario)
SELECT
    id, UUID, Base, Impuesto, TipoFactor, TasaOCuota, Importe,
    IFNULL(created_at, NOW()), IFNULL(updated_at, NOW()), created_by, updated_by, rfc_propietario
FROM administracion.factura_traslados;
SET @next_id = (SELECT IFNULL(MAX(id), 0) + 1 FROM cumbresbi_tesoreria_service.factura_traslados);
SET @sql = CONCAT('ALTER TABLE cumbresbi_tesoreria_service.factura_traslados AUTO_INCREMENT = ', @next_id);
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

-- ------------------------------------------------------------
-- 8. tesoreria_complementos_pago
--    id_contraparte no existe en legacy -> resuelto en bloque 12.
--    link_xml/drive_file_id_*/mime_type_* -> NULL (sin fuente legacy).
-- ------------------------------------------------------------
INSERT INTO cumbresbi_tesoreria_service.tesoreria_complementos_pago
    (id, id_contraparte, Timbre_UUID, Version, Serie, Folio, Fecha,
     NoCertificado, LugarExpedicion, TipoDeComprobante, Moneda, SubTotal,
     Total, Exportacion, Emisor_Rfc, Emisor_Nombre, Emisor_RegimenFiscal,
     Receptor_Rfc, Receptor_Nombre, Receptor_DomicilioFiscalReceptor,
     Receptor_RegimenFiscalReceptor, Receptor_UsoCFDI, Timbre_Version,
     Timbre_FechaTimbrado, Timbre_RfcProvCertif, Timbre_NoCertificadoSAT,
     fecha_de_pago, monto_pagado, uuid_relacion, tipo_factura, link_pdf,
     drive_file_id_pdf, mime_type_pdf, link_xml, drive_file_id_xml,
     mime_type_xml, created_at, created_by, updated_at, updated_by, estado)
SELECT
    id, NULL, Timbre_UUID, Version, Serie, Folio, IF(Fecha + 0 = 0, NULL, Fecha),
    NoCertificado, LugarExpedicion, TipoDeComprobante, Moneda, SubTotal,
    Total, Exportacion, Emisor_Rfc, Emisor_Nombre, Emisor_RegimenFiscal,
    Receptor_Rfc, Receptor_Nombre, Receptor_DomicilioFiscalReceptor,
    Receptor_RegimenFiscalReceptor, Receptor_UsoCFDI, Timbre_Version,
    IF(Timbre_FechaTimbrado + 0 = 0, NULL, Timbre_FechaTimbrado), Timbre_RfcProvCertif, Timbre_NoCertificadoSAT,
    fecha_de_pago, monto_pagado, uuid_relacion, tipo_factura, link_pdf,
    NULL, NULL, NULL, NULL,
    NULL, created_at, created_by, updated_at, updated_by, estado
FROM administracion.tesoreria_complementos_pago;
SET @next_id = (SELECT IFNULL(MAX(id), 0) + 1 FROM cumbresbi_tesoreria_service.tesoreria_complementos_pago);
SET @sql = CONCAT('ALTER TABLE cumbresbi_tesoreria_service.tesoreria_complementos_pago AUTO_INCREMENT = ', @next_id);
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

-- ------------------------------------------------------------
-- 9. tesoreria_rec_nominas
--    link_comprobante/drive_file_id_comprobante/mime_type_comprobante
--    -> NULL (decidido, sin fuente legacy).
-- ------------------------------------------------------------
INSERT INTO cumbresbi_tesoreria_service.tesoreria_rec_nominas
    (id, Version, Fecha, Moneda, TipoDeComprobante, Exportacion,
     MetodoPago, Serie, Folio, LugarExpedicion, SubTotal, Descuento,
     Total, Emisor_RegimenFiscal, Emisor_Rfc, Emisor_Nombre, Receptor_Rfc,
     Receptor_Nombre, Receptor_DomicilioFiscalReceptor,
     Receptor_RegimenFiscalReceptor, Receptor_UsoCFDI,
     Concepto_ClaveProdServ, Concepto_Cantidad, Concepto_ClaveUnidad,
     Concepto_Descripcion, Concepto_ObjetoImp, Concepto_ValorUnitario,
     Concepto_Importe, Concepto_Descuento, Nomina_Version,
     Nomina_TipoNomina, Nomina_FechaPago, Nomina_FechaInicialPago,
     Nomina_FechaFinalPago, Nomina_NumDiasPagados,
     Nomina_TotalPercepciones, Nomina_TotalDeducciones,
     Nomina_TotalOtrosPagos, RegistroPatronal, NomReceptor_Curp,
     NomReceptor_NumSeguridadSocial, NomReceptor_FechaInicioRelLaboral,
     `NomReceptor_Antigüedad`, NomReceptor_TipoContrato,
     NomReceptor_Sindicalizado, NomReceptor_TipoJornada,
     NomReceptor_TipoRegimen, NomReceptor_NumEmpleado,
     NomReceptor_Departamento, NomReceptor_Puesto,
     NomReceptor_RiesgoPuesto, NomReceptor_PeriodicidadPago,
     NomReceptor_SalarioBaseCotApor, NomReceptor_SalarioDiarioIntegrado,
     NomReceptor_ClaveEntFed, Percepciones_TotalSueldos,
     Percepciones_TotalGravado, Percepciones_TotalExento,
     Percepcion_TipoPercepcion, Percepcion_Clave, Percepcion_Concepto,
     Percepcion_ImporteGravado, Percepcion_ImporteExento,
     Deducciones_TotalOtrasDeducciones,
     Deducciones_TotalImpuestosRetenidos, Deduccion_TipoDeduccion,
     Deduccion_Clave, Deduccion_Concepto, Deduccion_Importe,
     OtroPago_TipoOtroPago, OtroPago_Clave, OtroPago_Concepto,
     OtroPago_Importe, SubsidioCausado, Timbre_Version, Timbre_UUID,
     Timbre_FechaTimbrado, Timbre_RfcProvCertif, tipo_factura, link_pdf,
     link_comprobante, drive_file_id_comprobante, mime_type_comprobante,
     created_at, created_by, updated_at, updated_by, estado)
SELECT
    id, Version, IF(Fecha + 0 = 0, NULL, Fecha), Moneda, TipoDeComprobante, Exportacion,
    MetodoPago, Serie, Folio, LugarExpedicion, SubTotal, Descuento,
    Total, Emisor_RegimenFiscal, Emisor_Rfc, Emisor_Nombre, Receptor_Rfc,
    Receptor_Nombre, Receptor_DomicilioFiscalReceptor,
    Receptor_RegimenFiscalReceptor, Receptor_UsoCFDI,
    Concepto_ClaveProdServ, Concepto_Cantidad, Concepto_ClaveUnidad,
    Concepto_Descripcion, Concepto_ObjetoImp, Concepto_ValorUnitario,
    Concepto_Importe, Concepto_Descuento, Nomina_Version,
    Nomina_TipoNomina, IF(Nomina_FechaPago + 0 = 0, NULL, Nomina_FechaPago), IF(Nomina_FechaInicialPago + 0 = 0, NULL, Nomina_FechaInicialPago),
    IF(Nomina_FechaFinalPago + 0 = 0, NULL, Nomina_FechaFinalPago), Nomina_NumDiasPagados,
    Nomina_TotalPercepciones, Nomina_TotalDeducciones,
    Nomina_TotalOtrosPagos, RegistroPatronal, NomReceptor_Curp,
    NomReceptor_NumSeguridadSocial, NomReceptor_FechaInicioRelLaboral,
    `NomReceptor_Antigüedad`, NomReceptor_TipoContrato,
    NomReceptor_Sindicalizado, NomReceptor_TipoJornada,
    NomReceptor_TipoRegimen, NomReceptor_NumEmpleado,
    NomReceptor_Departamento, NomReceptor_Puesto,
    NomReceptor_RiesgoPuesto, NomReceptor_PeriodicidadPago,
    NomReceptor_SalarioBaseCotApor, NomReceptor_SalarioDiarioIntegrado,
    NomReceptor_ClaveEntFed, Percepciones_TotalSueldos,
    Percepciones_TotalGravado, Percepciones_TotalExento,
    Percepcion_TipoPercepcion, Percepcion_Clave, Percepcion_Concepto,
    Percepcion_ImporteGravado, Percepcion_ImporteExento,
    Deducciones_TotalOtrasDeducciones,
    Deducciones_TotalImpuestosRetenidos, Deduccion_TipoDeduccion,
    Deduccion_Clave, Deduccion_Concepto, Deduccion_Importe,
    OtroPago_TipoOtroPago, OtroPago_Clave, OtroPago_Concepto,
    OtroPago_Importe, SubsidioCausado, Timbre_Version, Timbre_UUID,
    IF(Timbre_FechaTimbrado + 0 = 0, NULL, Timbre_FechaTimbrado), Timbre_RfcProvCertif, tipo_factura, link_pdf,
    NULL, NULL, NULL,
    created_at, created_by, updated_at, updated_by, estado
FROM administracion.tesoreria_rec_nominas;
SET @next_id = (SELECT IFNULL(MAX(id), 0) + 1 FROM cumbresbi_tesoreria_service.tesoreria_rec_nominas);
SET @sql = CONCAT('ALTER TABLE cumbresbi_tesoreria_service.tesoreria_rec_nominas AUTO_INCREMENT = ', @next_id);
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

-- ------------------------------------------------------------
-- 10. tesoreria_flujos
--     BLOQUEANTE: excluye explícitamente filas con id_contrato NULL
--     (ver verificación del bloque 0). Si el conteo ahí fue > 0, estas
--     filas quedan SIN migrar hasta resolverlas a mano.
--     categoria_gasto / drive_file_id_comprobante / id_nomina_periodo
--     (periodo_nomina) -> NULL (genuinamente nuevas, sin fuente legacy).
--     factura_uuid/complemento_uuid/nomina_uuid/estado_cfdi/etc. SÍ
--     existen en el legacy -> copia directa (corrección vs. mapeo viejo).
-- ------------------------------------------------------------
-- Verificación de huérfanos de FKs reales antes de insertar:
SELECT f.id_flujo, f.id_contrato
FROM administracion.tesoreria_flujos f
LEFT JOIN administracion.tesoreria_contratos c ON c.id_contrato = f.id_contrato
WHERE f.id_contrato IS NOT NULL AND c.id_contrato IS NULL;
-- (repetir el mismo patrón para cuenta / factura_uuid / complemento_uuid /
-- nomina_uuid contra tesoreria_cuentas / tesoreria_facturas / etc. si se
-- quiere blindar antes de correr el INSERT; cualquier huérfano real hará
-- fallar el INSERT por la FK real de Django, no un warning silencioso.)

INSERT INTO cumbresbi_tesoreria_service.tesoreria_flujos
    (id_flujo, id_contrato, categoria_gasto, id_empleado, id_requisicion,
     fecha_efectiva, concepto, reembolso, id_empleado_reembolso, cuenta,
     total_mxp, autorizacion, autorizado_por, fecha_autorizacion,
     link_referencia, pagado, fecha_pago, fecha_pago_original,
     descripcion_pago, link_comprobante_banco, drive_file_id_comprobante,
     factura_uuid, complemento_uuid, nomina_uuid, id_nomina_periodo,
     estado_cfdi, comprobacion_asignada_a, aprobacion_lista,
     validacion_estado, permiso_enviar_pago, informacion_envio,
     ultimo_envio, comentarios, permiso, requiere_complemento,
     created_at, created_by, updated_at, updated_by)
SELECT
    id_flujo, id_contrato, NULL, id_empleado, id_requisicion,
    IF(fecha_efectiva + 0 = 0, NULL, fecha_efectiva), concepto, reembolso, id_empleado_reembolso, cuenta,
    total_mxp, autorizacion, autorizado_por, IF(fecha_autorizacion + 0 = 0, NULL, fecha_autorizacion),
    link_referencia, pagado, IF(fecha_pago + 0 = 0, NULL, fecha_pago), IF(fecha_pago_original + 0 = 0, NULL, fecha_pago_original),
    descripcion_pago, link_comprobante_banco, NULL,
    factura_uuid, complemento_uuid, nomina_uuid, NULL,
    estado_cfdi, comprobacion_asignada_a, aprobacion_lista,
    IF(pagado = 1, 'APROBADA', validacion_estado), permiso_enviar_pago, informacion_envio,
    IF(ultimo_envio + 0 = 0, NULL, ultimo_envio), comentarios, permiso, requiere_complemento,
    IFNULL(created_at, NOW()), created_by, IFNULL(updated_at, NOW()), updated_by
FROM administracion.tesoreria_flujos
WHERE id_contrato IS NOT NULL;

-- ------------------------------------------------------------
-- 11. tesoreria_notas_credito (el header, distinto de
--     factura_notas_credito): FUERA DE ALCANCE de este script.
--     Si hace falta migrarla despues, es la misma estructura que
--     tesoreria_facturas (id_contraparte tambien se resolveria por RFC
--     del emisor).
-- ------------------------------------------------------------

-- ------------------------------------------------------------
-- 12. UPDATE posterior: resolver id_contraparte por RFC del emisor
--     (facturas y complementos de pago)
-- ------------------------------------------------------------
UPDATE cumbresbi_tesoreria_service.tesoreria_facturas f
JOIN cumbresbi_tesoreria_service.tesoreria_contrapartes cp
    ON cp.rfc = f.Emisor_Rfc
SET f.id_contraparte = cp.id_contraparte
WHERE f.id_contraparte IS NULL
  AND f.Emisor_Rfc IS NOT NULL;

UPDATE cumbresbi_tesoreria_service.tesoreria_complementos_pago cpg
JOIN cumbresbi_tesoreria_service.tesoreria_contrapartes cp
    ON cp.rfc = cpg.Emisor_Rfc
SET cpg.id_contraparte = cp.id_contraparte
WHERE cpg.id_contraparte IS NULL
  AND cpg.Emisor_Rfc IS NOT NULL;

-- ------------------------------------------------------------
-- 13. UPDATE final: forzar validacion_estado='APROBADA' donde pagado=True
--     (regla de negocio confirmada con Jenny; satisface el
--     CheckConstraint real tesoreria_flujo_pagado_requiere_aprobada:
--     ~Q(pagado=True) | Q(validacion_estado='APROBADA'))
-- ------------------------------------------------------------
UPDATE cumbresbi_tesoreria_service.tesoreria_flujos
SET validacion_estado = 'APROBADA'
WHERE pagado = 1
  AND (validacion_estado IS NULL OR validacion_estado <> 'APROBADA');
