CREATE TABLE `factura_conceptos` (
  `id` int PRIMARY KEY NOT NULL AUTO_INCREMENT,
  `UUID` varchar(50),
  `ClaveProdServ` varchar(20),
  `NoIdentificacion` varchar(200),
  `Cantidad` decimal(18,2),
  `ClaveUnidad` varchar(10),
  `Unidad` varchar(20),
  `Descripcion` text,
  `ValorUnitario` varchar(50),
  `Importe` varchar(50),
  `Descuento` varchar(50),
  `ObjetoImp` varchar(5),
  `created_at` timestamp DEFAULT (CURRENT_TIMESTAMP),
  `updated_at` datetime DEFAULT (CURRENT_TIMESTAMP),
  `created_by` varchar(100),
  `updated_by` varchar(100),
  `rfc_propietario` varchar(50)
);

CREATE TABLE `factura_doctos_relacionados` (
  `id` int PRIMARY KEY NOT NULL AUTO_INCREMENT,
  `Timbre_UUID` varchar(36),
  `IdDocumento` varchar(36),
  `Serie` varchar(25),
  `Folio` varchar(25),
  `MonedaDR` varchar(5),
  `EquivalenciaDR` varchar(50),
  `NumParcialidad` int,
  `ImpSaldoAnt` decimal(18,2),
  `ImpPagado` decimal(18,2),
  `ImpSaldoInsoluto` decimal(18,2),
  `ObjetoImpDR` varchar(5),
  `created_at` timestamp DEFAULT (CURRENT_TIMESTAMP),
  `updated_at` datetime DEFAULT (CURRENT_TIMESTAMP),
  `created_by` varchar(100),
  `updated_by` varchar(100),
  `rfc_propietario` varchar(50)
);

CREATE TABLE `factura_notas_credito` (
  `id` int PRIMARY KEY NOT NULL AUTO_INCREMENT,
  `uuid` varchar(50),
  `uuid_relacionado` varchar(200),
  `ClaveProdServ` varchar(100),
  `NoIdentificacion` varchar(50),
  `Cantidad` decimal(20,6),
  `ClaveUnidad` varchar(50),
  `Unidad` varchar(50),
  `Descripcion` varchar(700),
  `ValorUnitario` decimal(20,6),
  `Importe` decimal(20,6),
  `ObjetoImp` varchar(50),
  `Base` varchar(50),
  `Impuesto` varchar(50),
  `TipoFactor` varchar(50),
  `TasaOCuota` varchar(50),
  `ImporteTraslado` varchar(50),
  `TotalImpuestosTrasladados` varchar(50),
  `created_at` timestamp DEFAULT (CURRENT_TIMESTAMP),
  `updated_at` datetime DEFAULT (CURRENT_TIMESTAMP),
  `created_by` varchar(100),
  `updated_by` varchar(100),
  `rfc_propietario` varchar(50)
);

CREATE TABLE `factura_traslados` (
  `id` int PRIMARY KEY NOT NULL AUTO_INCREMENT,
  `UUID` varchar(36),
  `Base` varchar(50),
  `Impuesto` varchar(5),
  `TipoFactor` varchar(10),
  `TasaOCuota` varchar(50),
  `Importe` varchar(50),
  `created_at` timestamp DEFAULT (CURRENT_TIMESTAMP),
  `updated_at` datetime DEFAULT (CURRENT_TIMESTAMP),
  `created_by` varchar(100),
  `updated_by` varchar(100),
  `rfc_propietario` varchar(50)
);

CREATE TABLE `general_sociedades` (
  `rfc` varchar(13) PRIMARY KEY NOT NULL,
  `razon_social` varchar(100),
  `regimen_mercantil` varchar(100),
  `alias_sociedad` varchar(3),
  `created_at` timestamp DEFAULT (CURRENT_TIMESTAMP),
  `updated_at` datetime DEFAULT (CURRENT_TIMESTAMP),
  `created_by` varchar(100),
  `updated_by` varchar(100),
  `grupo` varchar(50)
);

CREATE TABLE `iam_identities` (
  `identity_id` char(8) PRIMARY KEY NOT NULL,
  `user_id` char(8) NOT NULL,
  `provider` ENUM ('google') NOT NULL,
  `provider_subject` varchar(255) NOT NULL,
  `email` varchar(254) NOT NULL,
  `email_verified` tinyint(1) NOT NULL DEFAULT 0,
  `hosted_domain` varchar(255),
  `picture_url` varchar(2083),
  `last_login_at` datetime,
  `created_at` datetime
);

CREATE TABLE `iam_permissions` (
  `permission_id` char(8) PRIMARY KEY NOT NULL,
  `perm_key` varchar(120) NOT NULL,
  `description` varchar(255),
  `created_at` datetime,
  `created_by` char(8) NOT NULL,
  `updated_at` datetime,
  `updated_by` char(8) NOT NULL
);

CREATE TABLE `iam_role_permissions` (
  `role_id` char(8) NOT NULL,
  `permission_id` char(8) NOT NULL,
  `created_at` datetime,
  `created_by` char(8) NOT NULL,
  `updated_at` datetime,
  `updated_by` char(8) NOT NULL
);

CREATE TABLE `iam_roles` (
  `role_id` char(8) PRIMARY KEY NOT NULL,
  `role_key` varchar(50) NOT NULL,
  `role_name` varchar(100) NOT NULL,
  `description` varchar(255),
  `created_at` datetime,
  `created_by` char(8) NOT NULL,
  `updated_at` datetime,
  `updated_by` char(8) NOT NULL
);

CREATE TABLE `iam_user_centro_access` (
  `user_id` char(8) NOT NULL,
  `centro_id` varchar(255) NOT NULL,
  `granted_by` char(8),
  `granted_at` datetime,
  `revoked_at` datetime
);

CREATE TABLE `iam_user_contrato_access` (
  `user_id` char(8) NOT NULL,
  `id_contrato` varchar(255) NOT NULL,
  `granted_by` char(8),
  `granted_at` datetime,
  `revoked_at` datetime
);

CREATE TABLE `iam_user_roles` (
  `assignment_id` char(8) PRIMARY KEY NOT NULL,
  `user_id` char(8) NOT NULL,
  `role_id` char(8) NOT NULL,
  `scope_type` ENUM ('GLOBAL', 'SOCIEDAD', 'PROYECTO') NOT NULL DEFAULT 'GLOBAL',
  `scope_id` varchar(255) NOT NULL DEFAULT '*',
  `granted_by` char(8),
  `granted_at` datetime,
  `revoked_at` datetime
);

CREATE TABLE `iam_users` (
  `user_id` char(8) PRIMARY KEY NOT NULL,
  `primary_email` varchar(254) NOT NULL,
  `display_name` varchar(150),
  `status` ENUM ('ACTIVE', 'SUSPENDED', 'DELETED') NOT NULL DEFAULT 'ACTIVE',
  `access_mode` ENUM ('STANDARD', 'RESTRICTED') NOT NULL DEFAULT 'STANDARD',
  `employee_id` varchar(255),
  `created_at` datetime,
  `updated_at` datetime
);

CREATE TABLE `pld_contrapartes_docs` (
  `id_kyc_doc` varchar(8) PRIMARY KEY NOT NULL,
  `id_kyc` varchar(8) NOT NULL,
  `denominacion` varchar(250),
  `detalles_adicionales` varchar(500),
  `status` ENUM ('PENDIENTE', 'INCOMPLETO', 'ENTREGADO', 'APROBADO'),
  `link_documento` varchar(2083),
  `fecha_solicitud` date,
  `fecha_limite` date,
  `fecha_entrega` date,
  `fecha_cierre` date,
  `comentarios` varchar(500),
  `created_at` datetime,
  `created_by` char(8) NOT NULL,
  `updated_at` datetime,
  `updated_by` char(8) NOT NULL
);

CREATE TABLE `pld_contrapartes_kyc` (
  `id_kyc` varchar(8) PRIMARY KEY NOT NULL,
  `id_contraparte` varchar(8) NOT NULL,
  `fecha_nac_const` date NOT NULL,
  `pais_nac_const` varchar(100) NOT NULL,
  `folio_mercantil` varchar(250),
  `objeto_social` varchar(250),
  `curp` varchar(18),
  `nacionalidad` varchar(100) NOT NULL,
  `ocupacion_act_economica` varchar(100) NOT NULL,
  `dom_calle` varchar(150) NOT NULL,
  `dom_numero_ext` varchar(50) NOT NULL,
  `dom_numero_int` varchar(50) NOT NULL,
  `dom_colonia` varchar(100) NOT NULL,
  `dom_municipio_alcaldia` varchar(255) NOT NULL,
  `dom_estado` varchar(255) NOT NULL,
  `dom_cp` varchar(10) NOT NULL,
  `dom_pais` varchar(100) NOT NULL,
  `tipo_identificacion` varchar(100),
  `autoridad_identificacion` varchar(250),
  `numero_identificacion` varchar(250),
  `dom_corresp_dom_calle` varchar(150),
  `dom_corresp_dom_numero_ext` varchar(50),
  `dom_corresp_dom_numero_int` varchar(50),
  `dom_corresp_dom_colonia` varchar(100),
  `dom_corresp_dom_municipio_alcaldia` varchar(255),
  `dom_corresp_dom_estado` varchar(255),
  `dom_corresp_dom_cp` varchar(10),
  `dom_corresp_dom_pais` varchar(100),
  `telefono_fijo` varchar(10) NOT NULL,
  `telefono_sms` varchar(10) NOT NULL,
  `estado_civil` ENUM ('SOLTERO', 'CASADO') NOT NULL,
  `ident_fideicomiso` varchar(100) NOT NULL,
  `link_carpeta` varchar(2083),
  `link_plantillas` varchar(2083),
  `link_documento_pld` varchar(2083),
  `estado_llenado` ENUM ('PENDIENTE', 'INCOMPLETO', 'ENTREGADO') NOT NULL DEFAULT 'PENDIENTE',
  `aprobado_por` char(8) NOT NULL,
  `aprobado_en` datetime,
  `comentarios` varchar(500),
  `created_at` datetime,
  `created_by` char(8) NOT NULL,
  `updated_at` datetime,
  `updated_by` char(8) NOT NULL,
  `fecha_vencimiento` date NOT NULL
);

CREATE TABLE `pld_ticket_cliente` (
  `id_pld_ticket` varchar(8) PRIMARY KEY NOT NULL,
  `id_kyc` varchar(8),
  `token` char(64) NOT NULL,
  `issued_at` datetime NOT NULL,
  `issued_by` char(8) NOT NULL,
  `expires_at` datetime NOT NULL,
  `max_uses` int NOT NULL,
  `uses_count` int NOT NULL,
  `first_used_at` datetime,
  `last_used_at` datetime,
  `revoked_at` datetime
);

CREATE TABLE `rentas_contratos` (
  `id_rentas_contrato` varchar(8) PRIMARY KEY NOT NULL,
  `id_contrato_tesoreria` varchar(255) NOT NULL,
  `arrendador` varchar(13) NOT NULL,
  `arrendatario` varchar(8) NOT NULL,
  `fiador` varchar(8),
  `nombre_comercial` varchar(255) NOT NULL,
  `giro` varchar(255) NOT NULL,
  `subtotal_renta_inicial` decimal(10,2),
  `renta_var_porc` decimal(10,2),
  `subtotal_mtto_inicial` decimal(10,2),
  `num_dep_garantia` decimal(10,2),
  `monto_dep_garantia` decimal(10,2) NOT NULL,
  `num_rentas_ant` decimal(10,2),
  `monto_rentas_ant` decimal(10,2) NOT NULL,
  `dias_factura` int,
  `dias_pago` int,
  `fecha_firma` date,
  `fecha_entrega` date,
  `fecha_apertura` date,
  `plazo_arrendador_meses` int,
  `fecha_vigencia_arrendador` date,
  `plazo_arrendatario_meses` int,
  `fecha_vigencia_arrendatario` date,
  `fecha_rescision` date,
  `fac_uso_cfdi` varchar(10) NOT NULL,
  `fac_regimen_fiscal` varchar(10) NOT NULL,
  `fac_metodo_pago` varchar(10) NOT NULL,
  `fac_forma_pago` varchar(10) NOT NULL,
  `fac_publico_general` tinyint(1),
  `fac_cp_fiscal` varchar(5),
  `fac_email` varchar(100),
  `condiciones_local` varchar(500),
  `acometida_electrica` tinyint(1),
  `servicio_telefonico` varchar(500),
  `agua_drenaje` varchar(500),
  `totem` tinyint(1),
  `cobro_agua` tinyint(1),
  `cobro_luz` tinyint(1) NOT NULL DEFAULT 0,
  `estado` ENUM ('BORRADOR', 'PENDIENTE FIRMA', 'VIGENTE', 'VENCIDO', 'RESCINDIDO') NOT NULL DEFAULT 'BORRADOR',
  `comentarios` varchar(500),
  `created_at` datetime,
  `created_by` char(8) NOT NULL,
  `updated_at` datetime,
  `updated_by` char(8) NOT NULL
);

CREATE TABLE `rentas_contratos_docs` (
  `id_rent_cont_doc` varchar(8) PRIMARY KEY NOT NULL,
  `id_rentas_contrato` varchar(8) NOT NULL,
  `denominacion` varchar(250) NOT NULL,
  `detalles_adicionales` varchar(500),
  `status` ENUM ('PENDIENTE', 'INCOMPLETO', 'ENTREGADO', 'APROBADO') NOT NULL DEFAULT 'PENDIENTE',
  `link_documento` varchar(2083),
  `fecha_solicitud` date,
  `fecha_limite` date,
  `fecha_entrega` date,
  `fecha_cierre` date,
  `comentarios` varchar(500),
  `created_at` datetime,
  `created_by` char(8) NOT NULL,
  `updated_at` datetime,
  `updated_by` char(8) NOT NULL
);

CREATE TABLE `rentas_inmuebles` (
  `id_inmueble` varchar(8) PRIMARY KEY NOT NULL,
  `id_ubicacion` varchar(8) NOT NULL,
  `denominacion` varchar(255) NOT NULL,
  `numero_inmueble` varchar(50) NOT NULL,
  `tipo` ENUM ('COMERCIAL', 'PUBLICIDAD', 'ESTACIONAMIENTO', 'OFICINAS', 'HABITACIONAL') NOT NULL,
  `superficie` decimal(10,2),
  `renta_m2_vigente` decimal(10,2),
  `subtotal_renta` decimal(10,2),
  `genera_iva` tinyint(1) NOT NULL DEFAULT 1,
  `monto_renta_iva` decimal(10,2),
  `mtto_porc` decimal(10,2),
  `subtotal_mtto` decimal(10,2),
  `monto_mtto_iva` decimal(10,2),
  `publicidad_porc` decimal(5,2),
  `subtotal_publicidad` decimal(10,2),
  `monto_publicidad_iva` decimal(10,2),
  `subtotal_agua` decimal(10,2),
  `monto_agua_iva` decimal(10,2),
  `link_carpeta` varchar(2083),
  `link_escrituras` varchar(2083),
  `comentarios` varchar(500),
  `created_at` datetime,
  `created_by` char(8) NOT NULL,
  `updated_at` datetime,
  `updated_by` char(8) NOT NULL
);

CREATE TABLE `rentas_inmuebles_contratos` (
  `id_rel_inmb_cont` varchar(8) PRIMARY KEY NOT NULL,
  `id_inmueble` varchar(8) NOT NULL,
  `id_rentas_contrato` varchar(8) NOT NULL,
  `comentarios` varchar(500),
  `created_at` datetime,
  `created_by` char(8) NOT NULL,
  `updated_at` datetime,
  `updated_by` char(8) NOT NULL
);

CREATE TABLE `rentas_referencias_pago` (
  `id` int PRIMARY KEY NOT NULL AUTO_INCREMENT,
  `Referencia_Pago` varchar(50),
  `Num_Local` varchar(50),
  `Nombre_Comercial` varchar(100),
  `Correo_Enviado` varchar(300),
  `Estado_Referencia` int,
  `Rfc_Arrendatario` varchar(50),
  `Razon_Social_Arrendatario` varchar(150)
);

CREATE TABLE `rentas_ubicaciones` (
  `id_ubicacion` char(8) PRIMARY KEY NOT NULL,
  `denominacion` varchar(255) NOT NULL,
  `calle` varchar(255) NOT NULL,
  `numero` varchar(50) NOT NULL,
  `interior` varchar(50),
  `colonia` varchar(255) NOT NULL,
  `municipio` varchar(255) NOT NULL,
  `estado` varchar(255) NOT NULL,
  `codigo_postal` varchar(10) NOT NULL,
  `pais` varchar(255) NOT NULL,
  `propietario_rfc` varchar(13) NOT NULL,
  `comentarios` varchar(500),
  `created_at` datetime,
  `created_by` char(8) NOT NULL,
  `updated_at` datetime,
  `updated_by` char(8) NOT NULL
);

CREATE TABLE `rrhh_empleados` (
  `id_empleado` varchar(255) PRIMARY KEY NOT NULL,
  `apellido_paterno` varchar(100),
  `apellido_materno` varchar(100),
  `nombres` varchar(100),
  `curp` varchar(18),
  `rfc` varchar(13),
  `nss` varchar(11),
  `cta_afore` varchar(50),
  `dom_calle` varchar(150),
  `dom_numero_ext` varchar(50),
  `dom_numero_int` varchar(50),
  `dom_colonia` varchar(100),
  `dom_cp` varchar(10),
  `dom_municipio_alcaldia` varchar(255),
  `dom_estado` varchar(255),
  `estado_civil` ENUM ('SOLTERO', 'CASADO'),
  `fecha_nacimiento` date,
  `nacimiento_mexico` tinyint(1),
  `municipio_nacimiento` varchar(255),
  `estado_nacimiento` varchar(255),
  `lugar_nacimiento_extran` text,
  `nacionalidad` varchar(255),
  `nombre_padre` varchar(100),
  `nombre_madre` varchar(100),
  `genero` ENUM ('MUJER', 'HOMBRE'),
  `telefono` varchar(10),
  `email` varchar(100),
  `banco` varchar(255),
  `cuenta_banco` varchar(18),
  `tipo_cuenta` varchar(255),
  `link_expediente` text,
  `estado` varchar(10),
  `created_at` timestamp DEFAULT (CURRENT_TIMESTAMP),
  `updated_at` datetime DEFAULT (CURRENT_TIMESTAMP),
  `created_by` varchar(100),
  `updated_by` varchar(100)
);

CREATE TABLE `rrhh_puestos` (
  `id_puesto` varchar(255) PRIMARY KEY NOT NULL,
  `id_empleado` varchar(255),
  `sociedad` varchar(13),
  `id_supervisor` varchar(255),
  `proyecto` varchar(3),
  `departamento` varchar(255),
  `puesto` varchar(100),
  `factor_integracion` decimal(9,6),
  `salario_diario` decimal(14,2),
  `descuentos_isr` decimal(14,2),
  `descuentos_imss` decimal(14,2),
  `tipo_salario` varchar(255),
  `turno` varchar(255),
  `umf` decimal(14,2),
  `fecha_alta` date,
  `fecha_baja` date,
  `motivo_fin` varchar(255),
  `tipo_pago` varchar(255),
  `link_alta_imss` varchar(2083),
  `link_baja_imss` varchar(2083),
  `created_at` timestamp DEFAULT (CURRENT_TIMESTAMP),
  `updated_at` datetime DEFAULT (CURRENT_TIMESTAMP),
  `created_by` varchar(100),
  `updated_by` varchar(100)
);

CREATE TABLE `tesoreria_bancos` (
  `id_banxico` varchar(5) PRIMARY KEY NOT NULL,
  `banco` varchar(50),
  `alias` varchar(5)
);

CREATE TABLE `tesoreria_complementos_pago` (
  `id` int PRIMARY KEY NOT NULL AUTO_INCREMENT,
  `Timbre_UUID` varchar(36) NOT NULL,
  `Version` varchar(5),
  `Serie` varchar(25),
  `Folio` varchar(25),
  `Fecha` datetime,
  `NoCertificado` varchar(50),
  `LugarExpedicion` varchar(10),
  `TipoDeComprobante` varchar(2),
  `Moneda` varchar(5),
  `SubTotal` decimal(18,2),
  `Total` decimal(18,2),
  `Exportacion` varchar(10),
  `Emisor_Rfc` varchar(13),
  `Emisor_Nombre` varchar(255),
  `Emisor_RegimenFiscal` varchar(5),
  `Receptor_Rfc` varchar(13),
  `Receptor_Nombre` varchar(255),
  `Receptor_DomicilioFiscalReceptor` varchar(10),
  `Receptor_RegimenFiscalReceptor` varchar(5),
  `Receptor_UsoCFDI` varchar(5),
  `Timbre_Version` varchar(5),
  `Timbre_FechaTimbrado` datetime,
  `Timbre_RfcProvCertif` varchar(13),
  `Timbre_NoCertificadoSAT` varchar(50),
  `fecha_de_pago` varchar(50),
  `monto_pagado` varchar(50),
  `uuid_relacion` varchar(50),
  `tipo_factura` varchar(50),
  `link_pdf` text,
  `created_at` timestamp NOT NULL DEFAULT (CURRENT_TIMESTAMP),
  `updated_at` datetime DEFAULT (CURRENT_TIMESTAMP),
  `created_by` varchar(100),
  `updated_by` varchar(100),
  `estado` varchar(50)
);

CREATE TABLE `tesoreria_contrapartes` (
  `rfc` varchar(13),
  `id_contraparte` char(8) PRIMARY KEY NOT NULL DEFAULT (lower(substr(replace(uuid(),_utf8mb3'-',_utf8mb4''),1,8))),
  `razon_social` varchar(100) NOT NULL,
  `contacto` varchar(100),
  `telefono_sms` varchar(10),
  `email` varchar(100) NOT NULL,
  `comentarios` text,
  `permiso` varchar(255),
  `created_at` timestamp DEFAULT (CURRENT_TIMESTAMP),
  `updated_at` datetime DEFAULT (CURRENT_TIMESTAMP),
  `created_by` varchar(100),
  `updated_by` varchar(100),
  `autorizado_por` varchar(100),
  `apellido_paterno` varchar(100),
  `apellido_materno` varchar(100),
  `tipo_persona` ENUM ('fisica', 'moral', 'fisica_act_emp', 'fideicomiso') NOT NULL,
  `genero` ENUM ('MUJER', 'HOMBRE'),
  `cliente` tinyint(1) NOT NULL DEFAULT 0,
  `proveedor` tinyint(1) NOT NULL DEFAULT 0
);

CREATE TABLE `tesoreria_contrapartes_relacion` (
  `id_relacion` varchar(8) PRIMARY KEY NOT NULL,
  `id_contraparte` varchar(8) NOT NULL,
  `id_contraparte_relacion` varchar(8) NOT NULL,
  `tipo_relacion` ENUM ('REP LEGAL', 'BENEF CONTROLADOR') NOT NULL,
  `created_at` datetime,
  `created_by` varchar(100),
  `updated_at` datetime,
  `updated_by` varchar(100)
);

CREATE TABLE `tesoreria_contratos` (
  `id_contrato` varchar(255) PRIMARY KEY NOT NULL,
  `fecha_generacion` date,
  `fecha_vencimiento` date,
  `tipo` ENUM ('INTERNO', 'EXTERNO'),
  `id_contraparte` char(8) NOT NULL,
  `sociedad` varchar(13) NOT NULL,
  `proyecto` varchar(3),
  `propiedad` varchar(50),
  `centro` varchar(100),
  `tipo_pago` ENUM ('REGULAR', 'IRREGULAR', 'UNICO'),
  `frecuencia` ENUM ('MENSUAL', 'BIMESTRAL', 'TRIMESTRAL', 'SEMESTRAL', 'ANUAL', 'OTRA', 'SEMANAL'),
  `duracion` decimal(4,0),
  `fecha_proyectada` date,
  `moneda` ENUM ('MXP', 'USD', 'EUR'),
  `monto_periodo_iva_mxp` decimal(14,2),
  `monto_total_iva_mxp` decimal(14,2),
  `concepto_factura` text,
  `link_carpeta` text,
  `link_contrato` text,
  `requiere_factura` tinyint(1),
  `comentarios` text,
  `status` ENUM ('ACTIVO', 'INACTIVO'),
  `permiso` varchar(255),
  `created_at` timestamp DEFAULT (CURRENT_TIMESTAMP),
  `updated_at` datetime DEFAULT (CURRENT_TIMESTAMP),
  `created_by` varchar(100),
  `updated_by` varchar(100),
  `autorizacion` tinyint(1)
);

CREATE TABLE `tesoreria_cortes_edc` (
  `id` char(8) PRIMARY KEY NOT NULL,
  `cuenta` varchar(8) NOT NULL,
  `fecha_final` date NOT NULL,
  `tipo` ENUM ('corte', 'estado_cuenta') NOT NULL,
  `formato` ENUM ('pdf', 'excel', 'csv', 'otro') NOT NULL,
  `link` varchar(2083) NOT NULL,
  `disponible` tinyint(1),
  `created_at` datetime,
  `created_by` char(8) NOT NULL,
  `updated_at` datetime,
  `updated_by` char(8) NOT NULL
);

CREATE TABLE `tesoreria_cuentas` (
  `id_cuenta_bancaria` varchar(8) PRIMARY KEY NOT NULL,
  `rfc_razon_social` varchar(50),
  `banco` varchar(5),
  `cuenta` varchar(20),
  `clabe` varchar(18),
  `alias` varchar(50),
  `label` varchar(100),
  `activa` tinyint,
  `apertura` date NOT NULL,
  `cierre` date
);

CREATE TABLE `tesoreria_facturas` (
  `id` int PRIMARY KEY NOT NULL AUTO_INCREMENT,
  `Comprobante_Version` varchar(10),
  `Comprobante_Serie` varchar(100),
  `Comprobante_Folio` varchar(100),
  `Comprobante_Fecha` datetime,
  `Comprobante_FormaPago` varchar(5),
  `Comprobante_NoCertificado` varchar(50),
  `Comprobante_SubTotal` varchar(50),
  `Comprobante_Moneda` varchar(50),
  `Comprobante_Exportacion` varchar(5),
  `Comprobante_TipoCambio` varchar(50),
  `Comprobante_Total` decimal(18,2),
  `Comprobante_TipoDeComprobante` varchar(2),
  `Comprobante_MetodoPago` varchar(5),
  `Comprobante_LugarExpedicion` varchar(300),
  `TipoRelacion` varchar(5),
  `UUID_Relacionado` varchar(50),
  `Emisor_Rfc` varchar(13),
  `Emisor_Nombre` varchar(255),
  `Emisor_RegimenFiscal` varchar(200),
  `Receptor_Rfc` varchar(13),
  `Receptor_Nombre` varchar(255),
  `Receptor_DomicilioFiscalReceptor` varchar(200),
  `Receptor_RegimenFiscalReceptor` varchar(5),
  `Receptor_UsoCFDI` varchar(5),
  `Timbre_Version` varchar(5),
  `Timbre_UUID` varchar(50) NOT NULL,
  `Timbre_FechaTimbrado` datetime,
  `Timbre_RfcProvCertif` varchar(13),
  `Timbre_NoCertificadoSAT` varchar(30),
  `tipo_factura` varchar(50),
  `link_pdf` text,
  `created_at` timestamp NOT NULL DEFAULT (CURRENT_TIMESTAMP),
  `updated_at` datetime DEFAULT (CURRENT_TIMESTAMP),
  `created_by` varchar(100),
  `updated_by` varchar(100),
  `estado` varchar(50)
);

CREATE TABLE `tesoreria_flujos` (
  `id_flujo` varchar(255) PRIMARY KEY NOT NULL,
  `id_contrato` varchar(255),
  `id_empleado` varchar(255),
  `id_requisicion` varchar(255),
  `fecha_efectiva` date,
  `concepto` text,
  `reembolso` tinyint(1),
  `id_empleado_reembolso` varchar(255),
  `cuenta` varchar(8) NOT NULL,
  `total_mxp` decimal(14,2),
  `autorizacion` tinyint(1),
  `autorizado_por` varchar(100),
  `fecha_autorizacion` date,
  `link_referencia` text,
  `pagado` tinyint(1),
  `fecha_pago` date,
  `fecha_pago_original` date,
  `descripcion_pago` varchar(150),
  `link_comprobante_banco` text,
  `factura_uuid` varchar(50),
  `complemento_uuid` varchar(255),
  `nomina_uuid` varchar(50),
  `estado_cfdi` varchar(50),
  `comprobacion_asignada_a` varchar(100),
  `aprobacion_lista` tinyint(1),
  `validacion_estado` ENUM ('PENDIENTE', 'APROBADA', 'RECHAZADA'),
  `permiso_enviar_pago` varchar(50),
  `informacion_envio` text,
  `ultimo_envio` timestamp,
  `comentarios` text,
  `permiso` varchar(255),
  `requiere_complemento` tinyint(1),
  `created_at` timestamp DEFAULT (CURRENT_TIMESTAMP),
  `updated_at` datetime DEFAULT (CURRENT_TIMESTAMP),
  `created_by` varchar(100),
  `updated_by` varchar(100)
);

CREATE TABLE `tesoreria_notas_credito` (
  `id` int PRIMARY KEY NOT NULL AUTO_INCREMENT,
  `Comprobante_Version` varchar(10),
  `Comprobante_Serie` varchar(100),
  `Comprobante_Folio` varchar(100),
  `Comprobante_Fecha` datetime,
  `Comprobante_FormaPago` varchar(5),
  `Comprobante_NoCertificado` varchar(30),
  `Comprobante_SubTotal` decimal(18,2),
  `Comprobante_Moneda` varchar(100),
  `Comprobante_Exportacion` varchar(5),
  `Comprobante_TipoCambio` varchar(50),
  `Comprobante_Total` decimal(18,2),
  `Comprobante_TipoDeComprobante` varchar(2),
  `Comprobante_MetodoPago` varchar(5),
  `Comprobante_LugarExpedicion` varchar(200),
  `TipoRelacion` varchar(5),
  `UUID_Relacionado` varchar(50),
  `Emisor_Rfc` varchar(13),
  `Emisor_Nombre` varchar(255),
  `Emisor_RegimenFiscal` varchar(5),
  `Receptor_Rfc` varchar(13),
  `Receptor_Nombre` varchar(255),
  `Receptor_DomicilioFiscalReceptor` varchar(10),
  `Receptor_RegimenFiscalReceptor` varchar(5),
  `Receptor_UsoCFDI` varchar(5),
  `Timbre_Version` varchar(5),
  `Timbre_UUID` varchar(50) NOT NULL,
  `Timbre_FechaTimbrado` datetime,
  `Timbre_RfcProvCertif` varchar(13),
  `Timbre_NoCertificadoSAT` varchar(30),
  `tipo_factura` varchar(50),
  `link_pdf` text,
  `created_at` timestamp NOT NULL DEFAULT (CURRENT_TIMESTAMP),
  `updated_at` datetime DEFAULT (CURRENT_TIMESTAMP),
  `created_by` varchar(100),
  `updated_by` varchar(100),
  `estado` varchar(50)
);

CREATE TABLE `tesoreria_rec_nominas` (
  `id` int PRIMARY KEY NOT NULL AUTO_INCREMENT,
  `Version` varchar(5),
  `Fecha` datetime,
  `Moneda` varchar(5),
  `TipoDeComprobante` char(1),
  `Exportacion` char(2),
  `MetodoPago` varchar(5),
  `Serie` varchar(20),
  `Folio` varchar(20),
  `LugarExpedicion` varchar(10),
  `SubTotal` decimal(12,2),
  `Descuento` varchar(50),
  `Total` decimal(12,2),
  `Emisor_RegimenFiscal` varchar(5),
  `Emisor_Rfc` varchar(13),
  `Emisor_Nombre` varchar(255),
  `Receptor_Rfc` varchar(13),
  `Receptor_Nombre` varchar(255),
  `Receptor_DomicilioFiscalReceptor` varchar(10),
  `Receptor_RegimenFiscalReceptor` varchar(5),
  `Receptor_UsoCFDI` varchar(5),
  `Concepto_ClaveProdServ` varchar(10),
  `Concepto_Cantidad` decimal(10,2),
  `Concepto_ClaveUnidad` varchar(5),
  `Concepto_Descripcion` varchar(100),
  `Concepto_ObjetoImp` varchar(5),
  `Concepto_ValorUnitario` decimal(12,2),
  `Concepto_Importe` decimal(12,2),
  `Concepto_Descuento` varchar(50),
  `Nomina_Version` varchar(5),
  `Nomina_TipoNomina` char(1),
  `Nomina_FechaPago` date,
  `Nomina_FechaInicialPago` date,
  `Nomina_FechaFinalPago` date,
  `Nomina_NumDiasPagados` varchar(50),
  `Nomina_TotalPercepciones` varchar(50),
  `Nomina_TotalDeducciones` varchar(50),
  `Nomina_TotalOtrosPagos` varchar(50),
  `RegistroPatronal` varchar(20),
  `NomReceptor_Curp` varchar(18),
  `NomReceptor_NumSeguridadSocial` varchar(20),
  `NomReceptor_FechaInicioRelLaboral` varchar(50),
  `NomReceptor_Antigüedad` varchar(10),
  `NomReceptor_TipoContrato` varchar(3),
  `NomReceptor_Sindicalizado` varchar(3),
  `NomReceptor_TipoJornada` varchar(3),
  `NomReceptor_TipoRegimen` varchar(3),
  `NomReceptor_NumEmpleado` varchar(20),
  `NomReceptor_Departamento` varchar(50),
  `NomReceptor_Puesto` varchar(50),
  `NomReceptor_RiesgoPuesto` varchar(2),
  `NomReceptor_PeriodicidadPago` varchar(3),
  `NomReceptor_SalarioBaseCotApor` varchar(50),
  `NomReceptor_SalarioDiarioIntegrado` varchar(50),
  `NomReceptor_ClaveEntFed` varchar(5),
  `Percepciones_TotalSueldos` varchar(50),
  `Percepciones_TotalGravado` varchar(50),
  `Percepciones_TotalExento` varchar(50),
  `Percepcion_TipoPercepcion` varchar(3),
  `Percepcion_Clave` varchar(10),
  `Percepcion_Concepto` varchar(100),
  `Percepcion_ImporteGravado` varchar(50),
  `Percepcion_ImporteExento` varchar(50),
  `Deducciones_TotalOtrasDeducciones` varchar(50),
  `Deducciones_TotalImpuestosRetenidos` varchar(50),
  `Deduccion_TipoDeduccion` varchar(3),
  `Deduccion_Clave` varchar(10),
  `Deduccion_Concepto` varchar(100),
  `Deduccion_Importe` varchar(50),
  `OtroPago_TipoOtroPago` varchar(3),
  `OtroPago_Clave` varchar(10),
  `OtroPago_Concepto` varchar(100),
  `OtroPago_Importe` varchar(50),
  `SubsidioCausado` varchar(50),
  `Timbre_Version` varchar(5),
  `Timbre_UUID` varchar(50),
  `Timbre_FechaTimbrado` datetime,
  `Timbre_RfcProvCertif` varchar(13),
  `tipo_factura` varchar(50),
  `link_pdf` text,
  `created_at` timestamp NOT NULL DEFAULT (CURRENT_TIMESTAMP),
  `updated_at` datetime DEFAULT (CURRENT_TIMESTAMP),
  `created_by` varchar(100),
  `updated_by` varchar(100),
  `estado` varchar(50)
);

CREATE TABLE `tesoreria_saldos` (
  `id` char(50) PRIMARY KEY NOT NULL,
  `fecha` date NOT NULL,
  `cuenta` varchar(50) NOT NULL,
  `saldo` decimal(18,2) NOT NULL DEFAULT 0,
  `cambio_dinero` decimal(18,2),
  `cambio_porcentual` decimal(8,4)
);

CREATE TABLE `tickets` (
  `id_ticket` char(8) PRIMARY KEY NOT NULL,
  `id_subproyecto` char(8) NOT NULL,
  `denominacion` varchar(255) NOT NULL,
  `categoria` varchar(255),
  `descripcion` varchar(500),
  `asignado_a` char(8) NOT NULL,
  `prioridad` ENUM ('ALTA', 'MEDIA', 'BAJA') NOT NULL DEFAULT 'BAJA',
  `fecha_inicio_prog` date,
  `fecha_inicio_real` date,
  `fecha_fin_prog` date NOT NULL,
  `fecha_fin_real` date,
  `estimacion_horas` decimal(10,2) NOT NULL,
  `carpeta` varchar(2083),
  `instrucciones_entrega` varchar(500),
  `comentarios` varchar(500),
  `created_at` datetime,
  `created_by` char(8) NOT NULL,
  `updated_at` datetime,
  `updated_by` char(8) NOT NULL
);

CREATE TABLE `tickets_centros` (
  `id_tickets_centro` char(8) PRIMARY KEY NOT NULL,
  `denominacion` varchar(255) NOT NULL,
  `descripcion` varchar(500),
  `comentarios` varchar(500),
  `created_at` datetime,
  `created_by` char(8) NOT NULL,
  `updated_at` datetime,
  `updated_by` char(8) NOT NULL
);

CREATE TABLE `tickets_dependencias` (
  `id_dependencia` char(8) PRIMARY KEY NOT NULL,
  `predecesora` char(8),
  `sucesora` char(8),
  `tipo` ENUM ('ESTRICTO', 'FLEXIBLE') NOT NULL DEFAULT 'ESTRICTO',
  `ventaja_desfase_dias` int NOT NULL,
  `comentarios` varchar(500),
  `created_at` datetime,
  `created_by` char(8) NOT NULL,
  `updated_at` datetime,
  `updated_by` char(8) NOT NULL
);

CREATE TABLE `tickets_log` (
  `id_log` char(8) PRIMARY KEY NOT NULL,
  `id_ticket` char(8) NOT NULL,
  `accion` ENUM ('COMENTARIO', 'ACTUALIZACION', 'CARGA ARCHIVO', 'CAMBIO ASIGNACION', 'OTRO') NOT NULL DEFAULT 'ACTUALIZACION',
  `comentario` varchar(500),
  `progreso_nuevo` decimal(5,2) NOT NULL,
  `horas_incurridas` decimal(5,2) NOT NULL,
  `descripcion_archivo` varchar(250),
  `url_archivo` varchar(2083),
  `created_at` datetime,
  `created_by` char(8) NOT NULL,
  `updated_at` datetime,
  `updated_by` char(8) NOT NULL
);

CREATE TABLE `tickets_proyectos` (
  `id_proyecto` char(8) PRIMARY KEY NOT NULL,
  `denominacion` varchar(255) NOT NULL,
  `descripcion` varchar(500),
  `centro` char(8) NOT NULL,
  `carpeta` varchar(2083),
  `responsable` char(8) NOT NULL,
  `estado` ENUM ('PLANEADO', 'EN CURSO', 'COMPLETADO', 'CANCELADO') NOT NULL DEFAULT 'PLANEADO',
  `vencimiento` date,
  `fecha_inicio` date,
  `fecha_fin` date,
  `progreso` decimal(5,2),
  `comentarios` varchar(500),
  `created_at` datetime,
  `created_by` char(8) NOT NULL,
  `updated_at` datetime,
  `updated_by` char(8) NOT NULL
);

CREATE TABLE `tickets_proyectos_participantes` (
  `id_proyectos_part` char(8) PRIMARY KEY NOT NULL,
  `id_proyecto` char(8) NOT NULL,
  `id_participante` char(8) NOT NULL,
  `comentarios` varchar(500),
  `created_at` datetime,
  `created_by` char(8) NOT NULL,
  `updated_at` datetime,
  `updated_by` char(8) NOT NULL
);

CREATE TABLE `tickets_subproyectos` (
  `id_subproyecto` char(8) PRIMARY KEY NOT NULL,
  `id_proyecto` varchar(36) NOT NULL,
  `sociedad` varchar(13) NOT NULL,
  `denominacion` varchar(255) NOT NULL,
  `descripcion` varchar(500),
  `carpeta` varchar(2083),
  `responsable` char(8) NOT NULL,
  `estado` ENUM ('PLANEADO', 'EN CURSO', 'COMPLETADO', 'CANCELADO') NOT NULL DEFAULT 'PLANEADO',
  `vencimiento` date,
  `fecha_inicio` date,
  `fecha_fin` date,
  `progreso` decimal(5,2),
  `comentarios` varchar(500),
  `created_at` datetime,
  `created_by` char(8) NOT NULL,
  `updated_at` datetime,
  `updated_by` char(8) NOT NULL
);

CREATE TABLE `vivienda_listado` (
  `id_vivienda` char(8) PRIMARY KEY NOT NULL,
  `id_proyecto` char(8) NOT NULL,
  `num_oficial` varchar(25),
  `etapa` varchar(25),
  `balcones_m2` decimal(14,2),
  `bodega_m2` decimal(14,2),
  `habitaciones` int,
  `cajones_est` decimal(14,0),
  `calle` text,
  `cuv` varchar(255),
  `denominacion` varchar(255),
  `disponible` tinyint(1),
  `fachada` varchar(255),
  `fondo_m2` decimal(14,2),
  `frente_m2` decimal(14,2),
  `lote` varchar(255),
  `modelo` varchar(255),
  `muestra` tinyint(1),
  `mz` varchar(255),
  `patio_m2` decimal(14,2),
  `piso` varchar(255),
  `precio_lista` decimal(14,2),
  `sup_const_m2` decimal(14,2),
  `sup_terreno_m2` decimal(14,2),
  `terraza_m2` decimal(14,2),
  `tipo` varchar(255),
  `torre` varchar(255),
  `comentarios` varchar(500),
  `created_at` datetime,
  `created_by` char(8) NOT NULL,
  `updated_at` datetime,
  `updated_by` char(8) NOT NULL
);

CREATE TABLE `vivienda_proyectos` (
  `id_proyecto` char(8) PRIMARY KEY NOT NULL,
  `alias_proyecto` varchar(5),
  `denominacion` varchar(250),
  `propietario` varchar(13),
  `dom_calle` varchar(150) NOT NULL,
  `dom_numero_ext` varchar(50) NOT NULL,
  `dom_numero_int` varchar(50) NOT NULL,
  `dom_colonia` varchar(100) NOT NULL,
  `dom_municipio_alcaldia` varchar(255) NOT NULL,
  `dom_estado` varchar(255) NOT NULL,
  `dom_cp` varchar(10) NOT NULL,
  `dom_pais` varchar(100) NOT NULL,
  `link_carpeta` varchar(2083),
  `comentarios` varchar(500),
  `created_at` datetime,
  `created_by` char(8) NOT NULL,
  `updated_at` datetime,
  `updated_by` char(8) NOT NULL
);

CREATE TABLE `vivienda_rel_expediente_clientes` (
  `id_rel_viv_exp_cliente` char(8) PRIMARY KEY NOT NULL,
  `id_expediente` char(8) NOT NULL,
  `id_contraparte` varchar(8) NOT NULL,
  `tipo` ENUM ('ACREDITADO', 'COACREDITADO') NOT NULL DEFAULT 'ACREDITADO',
  `emp_razon_social` varchar(100),
  `emp_contacto_empleador` varchar(100),
  `emp_telefono_empleador` varchar(10),
  `emp_email_empleador` varchar(100),
  `emp_antiguedad_anos` decimal(2,0),
  `emp_antiguedad_meses` decimal(2,0),
  `emp_dom_calle` varchar(150),
  `emp_dom_colonia` varchar(100),
  `emp_dom_cp` varchar(10),
  `emp_dom_estado` varchar(255),
  `emp_dom_municipio_alcaldia` varchar(255),
  `emp_dom_numero_ext` varchar(50),
  `emp_dom_numero_int` varchar(50),
  `emp_puesto` varchar(100),
  `nss` varchar(11),
  `dependientes_econ` int,
  `ingreso_men_honorarios` decimal(14,2),
  `ingreso_men_nomina` decimal(14,2),
  `ingreso_men_otros` decimal(14,2),
  `nombre_referencia` varchar(100),
  `email_referencia` varchar(100),
  `telefono_referencia` varchar(10),
  `tipo_credito_prin` varchar(255),
  `tipo_credito_sec` varchar(255),
  `comentarios` varchar(500),
  `created_at` datetime,
  `created_by` char(8) NOT NULL,
  `updated_at` datetime,
  `updated_by` char(8) NOT NULL
);

CREATE TABLE `vivienda_ventas_asesores` (
  `id_asesor` char(8) PRIMARY KEY NOT NULL,
  `nombre` varchar(100) NOT NULL,
  `telefono_sms` varchar(10),
  `email` varchar(100) NOT NULL,
  `contacto` varchar(100),
  `persona_moral` tinyint(1) NOT NULL,
  `razon_social` varchar(100),
  `porc_comision` decimal(2,2) NOT NULL,
  `rfc_afiliacion` varchar(13),
  `comentarios` varchar(500),
  `created_at` datetime,
  `created_by` char(8) NOT NULL,
  `updated_at` datetime,
  `updated_by` char(8) NOT NULL
);

CREATE TABLE `vivienda_ventas_expedientes` (
  `id_expediente` char(8) PRIMARY KEY NOT NULL,
  `id_vivienda` char(8) NOT NULL,
  `id_asesor` char(8) NOT NULL,
  `id_contrato` varchar(255) NOT NULL,
  `estado` ENUM ('PENDIENTE', 'EN PROCESO', 'CONCLUIDO', 'CANCELADO') NOT NULL DEFAULT 'PENDIENTE',
  `fecha_cierre` date,
  `link_expediente` varchar(2083),
  `comentarios` varchar(500),
  `created_at` datetime,
  `created_by` char(8) NOT NULL,
  `updated_at` datetime,
  `updated_by` char(8) NOT NULL
);

CREATE TABLE `vivienda_ventas_expedientes_items` (
  `id_item` char(8) PRIMARY KEY NOT NULL,
  `id_expediente` char(8) NOT NULL,
  `denominacion` varchar(250),
  `detalles_adicionales` varchar(500),
  `status` ENUM ('PENDIENTE', 'INCOMPLETO', 'ENTREGADO', 'APROBADO') NOT NULL DEFAULT 'PENDIENTE',
  `link_documento` varchar(2083),
  `fecha_solicitud` date,
  `fecha_limite` date NOT NULL,
  `fecha_entrega` date,
  `fecha_cierre` date,
  `comentarios` varchar(500),
  `created_at` datetime,
  `created_by` char(8) NOT NULL,
  `updated_at` datetime,
  `updated_by` char(8) NOT NULL
);

ALTER TABLE `iam_identities` ADD CONSTRAINT `iam_identities_ibfk_1` FOREIGN KEY (`user_id`) REFERENCES `iam_users` (`user_id`);

ALTER TABLE `iam_permissions` ADD CONSTRAINT `iam_permissions_ibfk_1` FOREIGN KEY (`created_by`) REFERENCES `iam_users` (`user_id`);

ALTER TABLE `iam_permissions` ADD CONSTRAINT `iam_permissions_ibfk_2` FOREIGN KEY (`updated_by`) REFERENCES `iam_users` (`user_id`);

ALTER TABLE `iam_role_permissions` ADD CONSTRAINT `iam_role_permissions_ibfk_2` FOREIGN KEY (`permission_id`) REFERENCES `iam_permissions` (`permission_id`);

ALTER TABLE `iam_role_permissions` ADD CONSTRAINT `iam_role_permissions_ibfk_3` FOREIGN KEY (`role_id`) REFERENCES `iam_roles` (`role_id`);

ALTER TABLE `iam_role_permissions` ADD CONSTRAINT `iam_role_permissions_ibfk_1` FOREIGN KEY (`created_by`) REFERENCES `iam_users` (`user_id`);

ALTER TABLE `iam_role_permissions` ADD CONSTRAINT `iam_role_permissions_ibfk_4` FOREIGN KEY (`updated_by`) REFERENCES `iam_users` (`user_id`);

ALTER TABLE `iam_roles` ADD CONSTRAINT `iam_roles_ibfk_1` FOREIGN KEY (`created_by`) REFERENCES `iam_users` (`user_id`);

ALTER TABLE `iam_roles` ADD CONSTRAINT `iam_roles_ibfk_2` FOREIGN KEY (`updated_by`) REFERENCES `iam_users` (`user_id`);

ALTER TABLE `iam_user_centro_access` ADD CONSTRAINT `iam_user_centro_access_ibfk_1` FOREIGN KEY (`granted_by`) REFERENCES `iam_users` (`user_id`);

ALTER TABLE `iam_user_centro_access` ADD CONSTRAINT `iam_user_centro_access_ibfk_2` FOREIGN KEY (`user_id`) REFERENCES `iam_users` (`user_id`);

ALTER TABLE `iam_user_contrato_access` ADD CONSTRAINT `iam_user_contrato_access_ibfk_1` FOREIGN KEY (`granted_by`) REFERENCES `iam_users` (`user_id`);

ALTER TABLE `iam_user_contrato_access` ADD CONSTRAINT `iam_user_contrato_access_ibfk_3` FOREIGN KEY (`user_id`) REFERENCES `iam_users` (`user_id`);

ALTER TABLE `iam_user_contrato_access` ADD CONSTRAINT `iam_user_contrato_access_ibfk_2` FOREIGN KEY (`id_contrato`) REFERENCES `tesoreria_contratos` (`id_contrato`);

ALTER TABLE `iam_user_roles` ADD CONSTRAINT `iam_user_roles_ibfk_2` FOREIGN KEY (`role_id`) REFERENCES `iam_roles` (`role_id`);

ALTER TABLE `iam_user_roles` ADD CONSTRAINT `iam_user_roles_ibfk_1` FOREIGN KEY (`granted_by`) REFERENCES `iam_users` (`user_id`);

ALTER TABLE `iam_user_roles` ADD CONSTRAINT `iam_user_roles_ibfk_3` FOREIGN KEY (`user_id`) REFERENCES `iam_users` (`user_id`);

ALTER TABLE `iam_users` ADD CONSTRAINT `iam_users_ibfk_1` FOREIGN KEY (`employee_id`) REFERENCES `rrhh_empleados` (`id_empleado`);

ALTER TABLE `pld_contrapartes_docs` ADD CONSTRAINT `pld_contrapartes_docs_ibfk_2` FOREIGN KEY (`created_by`) REFERENCES `iam_users` (`user_id`);

ALTER TABLE `pld_contrapartes_docs` ADD CONSTRAINT `pld_contrapartes_docs_ibfk_3` FOREIGN KEY (`updated_by`) REFERENCES `iam_users` (`user_id`);

ALTER TABLE `pld_contrapartes_docs` ADD CONSTRAINT `pld_contrapartes_docs_ibfk_1` FOREIGN KEY (`id_kyc`) REFERENCES `pld_contrapartes_kyc` (`id_kyc`);

ALTER TABLE `pld_contrapartes_kyc` ADD CONSTRAINT `pld_contrapartes_kyc_ibfk_2` FOREIGN KEY (`created_by`) REFERENCES `iam_users` (`user_id`);

ALTER TABLE `pld_contrapartes_kyc` ADD CONSTRAINT `pld_contrapartes_kyc_ibfk_3` FOREIGN KEY (`updated_by`) REFERENCES `iam_users` (`user_id`);

ALTER TABLE `pld_contrapartes_kyc` ADD CONSTRAINT `pld_contrapartes_kyc_ibfk_aprobado_por` FOREIGN KEY (`aprobado_por`) REFERENCES `iam_users` (`user_id`);

ALTER TABLE `pld_contrapartes_kyc` ADD CONSTRAINT `pld_contrapartes_kyc_ibfk_1` FOREIGN KEY (`id_contraparte`) REFERENCES `tesoreria_contrapartes` (`id_contraparte`);

ALTER TABLE `pld_ticket_cliente` ADD CONSTRAINT `pld_ticket_cliente_ibfk_3` FOREIGN KEY (`issued_by`) REFERENCES `iam_users` (`user_id`);

ALTER TABLE `pld_ticket_cliente` ADD CONSTRAINT `pld_ticket_cliente_ibfk_2` FOREIGN KEY (`id_kyc`) REFERENCES `pld_contrapartes_kyc` (`id_kyc`);

ALTER TABLE `rentas_contratos` ADD CONSTRAINT `rentas_contratos_ibfk_2` FOREIGN KEY (`arrendador`) REFERENCES `general_sociedades` (`rfc`);

ALTER TABLE `rentas_contratos` ADD CONSTRAINT `rentas_contratos_ibfk_5` FOREIGN KEY (`created_by`) REFERENCES `iam_users` (`user_id`);

ALTER TABLE `rentas_contratos` ADD CONSTRAINT `rentas_contratos_ibfk_6` FOREIGN KEY (`updated_by`) REFERENCES `iam_users` (`user_id`);

ALTER TABLE `rentas_contratos` ADD CONSTRAINT `rentas_contratos_ibfk_3` FOREIGN KEY (`arrendatario`) REFERENCES `tesoreria_contrapartes` (`id_contraparte`);

ALTER TABLE `rentas_contratos` ADD CONSTRAINT `rentas_contratos_ibfk_4` FOREIGN KEY (`fiador`) REFERENCES `tesoreria_contrapartes` (`id_contraparte`);

ALTER TABLE `rentas_contratos` ADD CONSTRAINT `rentas_contratos_ibfk_1` FOREIGN KEY (`id_contrato_tesoreria`) REFERENCES `tesoreria_contratos` (`id_contrato`);

ALTER TABLE `rentas_contratos_docs` ADD CONSTRAINT `rentas_contratos_docs_ibfk_2` FOREIGN KEY (`created_by`) REFERENCES `iam_users` (`user_id`);

ALTER TABLE `rentas_contratos_docs` ADD CONSTRAINT `rentas_contratos_docs_ibfk_3` FOREIGN KEY (`updated_by`) REFERENCES `iam_users` (`user_id`);

ALTER TABLE `rentas_contratos_docs` ADD CONSTRAINT `rentas_contratos_docs_ibfk_1` FOREIGN KEY (`id_rentas_contrato`) REFERENCES `rentas_contratos` (`id_rentas_contrato`);

ALTER TABLE `rentas_inmuebles` ADD CONSTRAINT `rentas_inmuebles_ibfk_2` FOREIGN KEY (`created_by`) REFERENCES `iam_users` (`user_id`);

ALTER TABLE `rentas_inmuebles` ADD CONSTRAINT `rentas_inmuebles_ibfk_3` FOREIGN KEY (`updated_by`) REFERENCES `iam_users` (`user_id`);

ALTER TABLE `rentas_inmuebles` ADD CONSTRAINT `rentas_inmuebles_ibfk_1` FOREIGN KEY (`id_ubicacion`) REFERENCES `rentas_ubicaciones` (`id_ubicacion`);

ALTER TABLE `rentas_inmuebles_contratos` ADD CONSTRAINT `rentas_inmuebles_contratos_ibfk_3` FOREIGN KEY (`created_by`) REFERENCES `iam_users` (`user_id`);

ALTER TABLE `rentas_inmuebles_contratos` ADD CONSTRAINT `rentas_inmuebles_contratos_ibfk_4` FOREIGN KEY (`updated_by`) REFERENCES `iam_users` (`user_id`);

ALTER TABLE `rentas_inmuebles_contratos` ADD CONSTRAINT `rentas_inmuebles_contratos_ibfk_2` FOREIGN KEY (`id_rentas_contrato`) REFERENCES `rentas_contratos` (`id_rentas_contrato`);

ALTER TABLE `rentas_inmuebles_contratos` ADD CONSTRAINT `rentas_inmuebles_contratos_ibfk_1` FOREIGN KEY (`id_inmueble`) REFERENCES `rentas_inmuebles` (`id_inmueble`);

ALTER TABLE `rentas_ubicaciones` ADD CONSTRAINT `rentas_ubicaciones_ibfk_1` FOREIGN KEY (`propietario_rfc`) REFERENCES `general_sociedades` (`rfc`);

ALTER TABLE `rentas_ubicaciones` ADD CONSTRAINT `rentas_ubicaciones_ibfk_2` FOREIGN KEY (`created_by`) REFERENCES `iam_users` (`user_id`);

ALTER TABLE `rentas_ubicaciones` ADD CONSTRAINT `rentas_ubicaciones_ibfk_3` FOREIGN KEY (`updated_by`) REFERENCES `iam_users` (`user_id`);

ALTER TABLE `rrhh_puestos` ADD CONSTRAINT `rrhh_puestos_ibfk_3` FOREIGN KEY (`sociedad`) REFERENCES `general_sociedades` (`rfc`);

ALTER TABLE `rrhh_puestos` ADD CONSTRAINT `rrhh_puestos_ibfk_1` FOREIGN KEY (`id_empleado`) REFERENCES `rrhh_empleados` (`id_empleado`);

ALTER TABLE `rrhh_puestos` ADD CONSTRAINT `rrhh_puestos_ibfk_2` FOREIGN KEY (`id_supervisor`) REFERENCES `rrhh_empleados` (`id_empleado`);

ALTER TABLE `tesoreria_contrapartes_relacion` ADD CONSTRAINT `tesoreria_contrapartes_relacion_ibfk_1` FOREIGN KEY (`id_contraparte`) REFERENCES `tesoreria_contrapartes` (`id_contraparte`);

ALTER TABLE `tesoreria_contrapartes_relacion` ADD CONSTRAINT `tesoreria_contrapartes_relacion_ibfk_2` FOREIGN KEY (`id_contraparte_relacion`) REFERENCES `tesoreria_contrapartes` (`id_contraparte`);

ALTER TABLE `tesoreria_contratos` ADD CONSTRAINT `tesoreria_contratos_ibfk_1` FOREIGN KEY (`sociedad`) REFERENCES `general_sociedades` (`rfc`);

ALTER TABLE `tesoreria_contratos` ADD CONSTRAINT `fk_tes_contratos_contrapartes_id` FOREIGN KEY (`id_contraparte`) REFERENCES `tesoreria_contrapartes` (`id_contraparte`);

ALTER TABLE `tesoreria_cortes_edc` ADD CONSTRAINT `tesoreria_cortes_edc_ibfk_1` FOREIGN KEY (`cuenta`) REFERENCES `tesoreria_cuentas` (`id_cuenta_bancaria`);

ALTER TABLE `tesoreria_cuentas` ADD CONSTRAINT `fk_cuentas_bancos` FOREIGN KEY (`banco`) REFERENCES `tesoreria_bancos` (`id_banxico`);

ALTER TABLE `tesoreria_flujos` ADD CONSTRAINT `tesoreria_flujos_ibfk_2` FOREIGN KEY (`id_empleado`) REFERENCES `rrhh_empleados` (`id_empleado`);

ALTER TABLE `tesoreria_flujos` ADD CONSTRAINT `tesoreria_flujos_ibfk_3` FOREIGN KEY (`id_empleado_reembolso`) REFERENCES `rrhh_empleados` (`id_empleado`);

ALTER TABLE `tesoreria_flujos` ADD CONSTRAINT `tesoreria_flujos_ibfk_5` FOREIGN KEY (`complemento_uuid`) REFERENCES `tesoreria_complementos_pago` (`Timbre_UUID`);

ALTER TABLE `tesoreria_flujos` ADD CONSTRAINT `tesoreria_flujos_ibfk_1` FOREIGN KEY (`id_contrato`) REFERENCES `tesoreria_contratos` (`id_contrato`);

ALTER TABLE `tesoreria_flujos` ADD CONSTRAINT `fk_flujos_cuenta` FOREIGN KEY (`cuenta`) REFERENCES `tesoreria_cuentas` (`id_cuenta_bancaria`);

ALTER TABLE `tesoreria_flujos` ADD CONSTRAINT `tesoreria_flujos_ibfk_4` FOREIGN KEY (`factura_uuid`) REFERENCES `tesoreria_facturas` (`Timbre_UUID`);

ALTER TABLE `tesoreria_flujos` ADD CONSTRAINT `tesoreria_flujos_ibfk_6` FOREIGN KEY (`nomina_uuid`) REFERENCES `tesoreria_rec_nominas` (`Timbre_UUID`);

ALTER TABLE `tesoreria_notas_credito` ADD CONSTRAINT `tesoreria_notas_credito_ibfk_1` FOREIGN KEY (`UUID_Relacionado`) REFERENCES `tesoreria_facturas` (`Timbre_UUID`);

ALTER TABLE `tickets` ADD CONSTRAINT `tickets_ibfk_2` FOREIGN KEY (`asignado_a`) REFERENCES `iam_users` (`user_id`);

ALTER TABLE `tickets` ADD CONSTRAINT `tickets_ibfk_3` FOREIGN KEY (`created_by`) REFERENCES `iam_users` (`user_id`);

ALTER TABLE `tickets` ADD CONSTRAINT `tickets_ibfk_4` FOREIGN KEY (`updated_by`) REFERENCES `iam_users` (`user_id`);

ALTER TABLE `tickets` ADD CONSTRAINT `tickets_ibfk_1` FOREIGN KEY (`id_subproyecto`) REFERENCES `tickets_subproyectos` (`id_subproyecto`);

ALTER TABLE `tickets_centros` ADD CONSTRAINT `tickets_centros_ibfk_1` FOREIGN KEY (`created_by`) REFERENCES `iam_users` (`user_id`);

ALTER TABLE `tickets_centros` ADD CONSTRAINT `tickets_centros_ibfk_2` FOREIGN KEY (`updated_by`) REFERENCES `iam_users` (`user_id`);

ALTER TABLE `tickets_dependencias` ADD CONSTRAINT `tickets_dependencias_ibfk_3` FOREIGN KEY (`created_by`) REFERENCES `iam_users` (`user_id`);

ALTER TABLE `tickets_dependencias` ADD CONSTRAINT `tickets_dependencias_ibfk_4` FOREIGN KEY (`updated_by`) REFERENCES `iam_users` (`user_id`);

ALTER TABLE `tickets_dependencias` ADD CONSTRAINT `tickets_dependencias_ibfk_1` FOREIGN KEY (`predecesora`) REFERENCES `tickets` (`id_ticket`);

ALTER TABLE `tickets_dependencias` ADD CONSTRAINT `tickets_dependencias_ibfk_2` FOREIGN KEY (`sucesora`) REFERENCES `tickets` (`id_ticket`);

ALTER TABLE `tickets_log` ADD CONSTRAINT `tickets_log_ibfk_2` FOREIGN KEY (`created_by`) REFERENCES `iam_users` (`user_id`);

ALTER TABLE `tickets_log` ADD CONSTRAINT `tickets_log_ibfk_3` FOREIGN KEY (`updated_by`) REFERENCES `iam_users` (`user_id`);

ALTER TABLE `tickets_log` ADD CONSTRAINT `tickets_log_ibfk_1` FOREIGN KEY (`id_ticket`) REFERENCES `tickets` (`id_ticket`);

ALTER TABLE `tickets_proyectos` ADD CONSTRAINT `tickets_proyectos_ibfk_2` FOREIGN KEY (`responsable`) REFERENCES `iam_users` (`user_id`);

ALTER TABLE `tickets_proyectos` ADD CONSTRAINT `tickets_proyectos_ibfk_3` FOREIGN KEY (`created_by`) REFERENCES `iam_users` (`user_id`);

ALTER TABLE `tickets_proyectos` ADD CONSTRAINT `tickets_proyectos_ibfk_4` FOREIGN KEY (`updated_by`) REFERENCES `iam_users` (`user_id`);

ALTER TABLE `tickets_proyectos` ADD CONSTRAINT `tickets_proyectos_ibfk_1` FOREIGN KEY (`centro`) REFERENCES `tickets_centros` (`id_tickets_centro`);

ALTER TABLE `tickets_proyectos_participantes` ADD CONSTRAINT `tickets_proyectos_participantes_ibfk_2` FOREIGN KEY (`id_participante`) REFERENCES `iam_users` (`user_id`);

ALTER TABLE `tickets_proyectos_participantes` ADD CONSTRAINT `tickets_proyectos_participantes_ibfk_3` FOREIGN KEY (`created_by`) REFERENCES `iam_users` (`user_id`);

ALTER TABLE `tickets_proyectos_participantes` ADD CONSTRAINT `tickets_proyectos_participantes_ibfk_4` FOREIGN KEY (`updated_by`) REFERENCES `iam_users` (`user_id`);

ALTER TABLE `tickets_proyectos_participantes` ADD CONSTRAINT `tickets_proyectos_participantes_ibfk_1` FOREIGN KEY (`id_proyecto`) REFERENCES `tickets_proyectos` (`id_proyecto`);

ALTER TABLE `tickets_subproyectos` ADD CONSTRAINT `tickets_subproyectos_ibfk_2` FOREIGN KEY (`sociedad`) REFERENCES `general_sociedades` (`rfc`);

ALTER TABLE `tickets_subproyectos` ADD CONSTRAINT `tickets_subproyectos_ibfk_3` FOREIGN KEY (`responsable`) REFERENCES `iam_users` (`user_id`);

ALTER TABLE `tickets_subproyectos` ADD CONSTRAINT `tickets_subproyectos_ibfk_4` FOREIGN KEY (`created_by`) REFERENCES `iam_users` (`user_id`);

ALTER TABLE `tickets_subproyectos` ADD CONSTRAINT `tickets_subproyectos_ibfk_5` FOREIGN KEY (`updated_by`) REFERENCES `iam_users` (`user_id`);

ALTER TABLE `tickets_subproyectos` ADD CONSTRAINT `tickets_subproyectos_ibfk_1` FOREIGN KEY (`id_proyecto`) REFERENCES `tickets_proyectos` (`id_proyecto`);

ALTER TABLE `vivienda_listado` ADD CONSTRAINT `vivienda_listado_ibfk_2` FOREIGN KEY (`created_by`) REFERENCES `iam_users` (`user_id`);

ALTER TABLE `vivienda_listado` ADD CONSTRAINT `vivienda_listado_ibfk_3` FOREIGN KEY (`updated_by`) REFERENCES `iam_users` (`user_id`);

ALTER TABLE `vivienda_listado` ADD CONSTRAINT `vivienda_listado_ibfk_1` FOREIGN KEY (`id_proyecto`) REFERENCES `vivienda_proyectos` (`id_proyecto`);

ALTER TABLE `vivienda_proyectos` ADD CONSTRAINT `vivienda_proyectos_ibfk_1` FOREIGN KEY (`propietario`) REFERENCES `general_sociedades` (`rfc`);

ALTER TABLE `vivienda_proyectos` ADD CONSTRAINT `vivienda_proyectos_ibfk_2` FOREIGN KEY (`created_by`) REFERENCES `iam_users` (`user_id`);

ALTER TABLE `vivienda_proyectos` ADD CONSTRAINT `vivienda_proyectos_ibfk_3` FOREIGN KEY (`updated_by`) REFERENCES `iam_users` (`user_id`);

ALTER TABLE `vivienda_rel_expediente_clientes` ADD CONSTRAINT `vivienda_rel_expediente_clientes_ibfk_3` FOREIGN KEY (`created_by`) REFERENCES `iam_users` (`user_id`);

ALTER TABLE `vivienda_rel_expediente_clientes` ADD CONSTRAINT `vivienda_rel_expediente_clientes_ibfk_4` FOREIGN KEY (`updated_by`) REFERENCES `iam_users` (`user_id`);

ALTER TABLE `vivienda_rel_expediente_clientes` ADD CONSTRAINT `vivienda_rel_expediente_clientes_ibfk_2` FOREIGN KEY (`id_contraparte`) REFERENCES `tesoreria_contrapartes` (`id_contraparte`);

ALTER TABLE `vivienda_rel_expediente_clientes` ADD CONSTRAINT `vivienda_rel_expediente_clientes_ibfk_1` FOREIGN KEY (`id_expediente`) REFERENCES `vivienda_ventas_expedientes` (`id_expediente`);

ALTER TABLE `vivienda_ventas_asesores` ADD CONSTRAINT `vivienda_ventas_asesores_ibfk_1` FOREIGN KEY (`created_by`) REFERENCES `iam_users` (`user_id`);

ALTER TABLE `vivienda_ventas_asesores` ADD CONSTRAINT `vivienda_ventas_asesores_ibfk_2` FOREIGN KEY (`updated_by`) REFERENCES `iam_users` (`user_id`);

ALTER TABLE `vivienda_ventas_expedientes` ADD CONSTRAINT `vivienda_ventas_expedientes_ibfk_4` FOREIGN KEY (`created_by`) REFERENCES `iam_users` (`user_id`);

ALTER TABLE `vivienda_ventas_expedientes` ADD CONSTRAINT `vivienda_ventas_expedientes_ibfk_5` FOREIGN KEY (`updated_by`) REFERENCES `iam_users` (`user_id`);

ALTER TABLE `vivienda_ventas_expedientes` ADD CONSTRAINT `vivienda_ventas_expedientes_ibfk_3` FOREIGN KEY (`id_contrato`) REFERENCES `tesoreria_contratos` (`id_contrato`);

ALTER TABLE `vivienda_ventas_expedientes` ADD CONSTRAINT `vivienda_ventas_expedientes_ibfk_1` FOREIGN KEY (`id_vivienda`) REFERENCES `vivienda_listado` (`id_vivienda`);

ALTER TABLE `vivienda_ventas_expedientes` ADD CONSTRAINT `vivienda_ventas_expedientes_ibfk_2` FOREIGN KEY (`id_asesor`) REFERENCES `vivienda_ventas_asesores` (`id_asesor`);

ALTER TABLE `vivienda_ventas_expedientes_items` ADD CONSTRAINT `vivienda_ventas_expedientes_items_ibfk_2` FOREIGN KEY (`created_by`) REFERENCES `iam_users` (`user_id`);

ALTER TABLE `vivienda_ventas_expedientes_items` ADD CONSTRAINT `vivienda_ventas_expedientes_items_ibfk_3` FOREIGN KEY (`updated_by`) REFERENCES `iam_users` (`user_id`);

ALTER TABLE `vivienda_ventas_expedientes_items` ADD CONSTRAINT `vivienda_ventas_expedientes_items_ibfk_1` FOREIGN KEY (`id_expediente`) REFERENCES `vivienda_ventas_expedientes` (`id_expediente`);
