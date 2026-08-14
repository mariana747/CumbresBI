from django.urls import path

from drive import views

urlpatterns = [
    path("api/upload/", views.UploadView.as_view(), name="drive-upload"),
    path("api/download/<str:file_id>/", views.DownloadView.as_view(), name="drive-download"),
    path("api/list/", views.ListFilesView.as_view(), name="drive-list"),
    path("api/browse/", views.BrowseView.as_view(), name="drive-browse"),
]
