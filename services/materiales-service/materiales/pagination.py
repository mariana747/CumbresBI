from rest_framework.pagination import PageNumberPagination


class ListadoGrandePagination(PageNumberPagination):
    """Paginacion para listados que pueden crecer sin limite (Catalogo de
    Materiales, Salida de Almacen) - mismo patron que tesoreria-service/
    tesoreria/pagination.py (ver ListadoGrandePagination ahi, fix real de
    un problema de timeout/memoria con volumen real).
    """

    page_size = 50
    page_size_query_param = "page_size"
    max_page_size = 200
