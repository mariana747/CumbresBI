from django.contrib import admin
from django.urls import path

from docint.views import AnalysisStatusView, AnalyzeView, ProcesarAnalisisView

urlpatterns = [
    path("admin/", admin.site.urls),
    path("analyze", AnalyzeView.as_view(), name="analyze"),
    path("analyze/<str:analysis_id>/procesar", ProcesarAnalisisView.as_view(), name="analyze-procesar"),
    path("analyze/<str:analysis_id>/status", AnalysisStatusView.as_view(), name="analyze-status"),
]
