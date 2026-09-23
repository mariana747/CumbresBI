from rest_framework.pagination import PageNumberPagination


class ListadoGrandePagination(PageNumberPagination):
    """Mismo patron que materiales-service/tesoreria-service - listados que
    pueden crecer sin limite (ver Requisicion/Catalogo de Materiales)."""

    page_size = 50
    page_size_query_param = "page_size"
    max_page_size = 200
