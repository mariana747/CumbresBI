# Google Cloud Document AI — alternativa futura al Motor Documental (no desarrollada en esta versión)

> Actividad de la Fase 0, Semana 3 del Plan de Trabajo: *"Documentación de Google Cloud Document AI
> como alternativa futura (...), sin desarrollarse en esta versión del proyecto."* Este documento
> cumple ese punto — es solo documentación, no hay código ni infraestructura de Document AI en el
> repo.

## Qué es

Google Cloud Document AI es un servicio especializado de extracción de documentos (OCR + parsers
entrenados) para casos altamente estructurados o regulados: facturas, identificaciones oficiales,
formularios fiscales, contratos con esquema fijo. Ofrece "processors" pre-entrenados por tipo de
documento y controles de cumplimiento adicionales (residencia de datos, auditoría más granular a
nivel de campo extraído) que Gemini API no expone de la misma forma.

## Por qué no se usa en esta versión

El [Motor Inteligente de Procesamiento Documental](README.md#10-arquitectura-del-motor-inteligente-de-procesamiento-documental)
ya cumple los requisitos actuales (PLD/KYC, cotizaciones/facturas de Compras, onboarding de RRHH)
con **Gemini API** como único proveedor: maneja documentos variados sin necesidad de entrenar un
"processor" por tipo, y ya está integrado y validado en Fase 2 (PLD) como primer consumidor. Adoptar
Document AI ahora sería costo de desarrollo e infraestructura adicional (processors por tipo
documental, otra cuenta de servicio, otro secreto en Secret Manager) sin un requisito de negocio
actual que Gemini no resuelva.

## Cómo se integraría si se necesita después

El motor ya está diseñado con el **patrón adaptador** para que este cambio no rompa a los módulos
consumidores (PLD, Compras/Tesorería/Materiales, RRHH):

- `DocumentIntelligenceProvider` (ABC) — [`services/document-intelligence-service/docint/providers/base.py`](../../services/document-intelligence-service/docint/providers/base.py) —
  define el contrato `analyze(request, document_bytes, mime_type) -> DocumentAnalysisResult`.
- `GeminiProvider` — implementación actual, único proveedor activo.
- `DocumentAIProvider` — **no implementado todavía**; sería una segunda clase que cumple el mismo
  contrato, seleccionable vía `get_provider()` sin que ningún módulo consumidor cambie una línea de
  su código (ellos solo conocen `DocumentAnalysisRequest`/`DocumentAnalysisResult`, nunca al proveedor
  concreto).

## Cuándo reconsiderarlo

Revaluar Document AI si aparece alguno de estos casos:
- Un tipo documental de alto volumen y formato muy fijo donde un "processor" entrenado reduzca
  significativamente errores de extracción frente a Gemini (ej. facturas CFDI en Fase 4).
- Un requisito regulatorio/de auditoría (PLD/AML) que exija controles de procesamiento documental
  más estrictos que los que Gemini API ofrece hoy.
- Degradación de confianza/precisión de Gemini en un tipo documental específico, medida con datos
  reales de producción.

Mientras ninguno de estos se materialice, el motor sigue operando con Gemini como proveedor único.
