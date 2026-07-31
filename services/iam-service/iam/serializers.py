from rest_framework import serializers

from .models import IamUser


class IamUserSerializer(serializers.ModelSerializer):
    class Meta:
        model = IamUser
        fields = [
            "user_id",
            "primary_email",
            "display_name",
            "status",
            "access_mode",
            "created_at",
            "updated_at",
        ]
        read_only_fields = fields
