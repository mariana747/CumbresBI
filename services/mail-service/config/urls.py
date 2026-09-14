from django.urls import path

from mail import views

urlpatterns = [
    path("api/send/", views.SendEmailView.as_view(), name="mail-send"),
]
