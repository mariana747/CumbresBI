from django.urls import re_path

from gateway import views

# Catch-all: TODO lo que llega al Gateway pasa por gateway.views.proxy, que
# decide a que microservicio reenviarlo segun el primer segmento del path
# (settings.SERVICE_ROUTES). No hay rutas propias del Gateway aparte de esta.
urlpatterns = [
    re_path(r"^(?P<path>.*)$", views.proxy),
]
