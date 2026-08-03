# Esqueleto de Fase 0 (Actividad 4). Sin modelos de negocio todavia: compras
# no tiene tablas propias en el ERD heredado (dominio nuevo de Fase 4, ver
# Supuestos y puntos abiertos del doc de arquitectura) - lo unico que existia
# aqui era Tesoreria/CFDI/Contrapartes, que ya se separo a tesoreria-service
# (ver rama split-tesoreria-rentas-services / docs/architecture/README.md
# sec. 1.1). No inventar aqui estructura de negocio sin una fuente de verdad.
from django.db import models  # noqa: F401
