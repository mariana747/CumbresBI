from django.contrib import admin
from django.urls import path

from docint.views import AnalyzeView

urlpatterns = [
    path("admin/", admin.site.urls),
    path("analyze", AnalyzeView.as_view(), name="analyze"),
]
