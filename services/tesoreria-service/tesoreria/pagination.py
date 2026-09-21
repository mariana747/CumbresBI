from rest_framework.pagination import PageNumberPagination


class ListadoGrandePagination(PageNumberPagination):
    """Paginacion para listados que pueden crecer sin limite (Flujos,
    Facturas). Sin esto el listado completo se serializa en una sola
    respuesta y, con volumen real (post-migracion de datos legacy), el
    request excede el timeout/memoria del contenedor en Cloud Run y
    responde 503 (20/Sep/2026, fix del mismo problema que ya se habia
    parchado a medias en Facturas con batch-prefetch, ver
    TesoreriaFacturaViewSet.list()).
    """

    page_size = 50
    page_size_query_param = "page_size"
    max_page_size = 200
