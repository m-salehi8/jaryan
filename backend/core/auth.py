from rest_framework.authentication import BaseAuthentication
from rest_framework.exceptions import AuthenticationFailed
from django.contrib.auth import get_user_model
import jwt
from django.conf import settings
from .models import current_org_id

User = get_user_model()

class JWTAuthentication(BaseAuthentication):
    def authenticate(self, request):
        auth_header = request.headers.get('Authorization')
        if not auth_header or not auth_header.startswith('Bearer '):
            return None

        token = auth_header.split(' ')[1]
        try:
            # Assuming a generic JWT secret if not in settings yet.
            # In production, use settings.SECRET_KEY or a specific JWT_SECRET.
            payload = jwt.decode(token, settings.SECRET_KEY, algorithms=['HS256'])
        except jwt.ExpiredSignatureError:
            raise AuthenticationFailed('Token expired')
        except jwt.InvalidTokenError:
            raise AuthenticationFailed('Invalid token')

        user_id = payload.get('user_id')
        if not user_id:
            raise AuthenticationFailed('Invalid payload')

        try:
            # We use _base_manager here because if current_org_id is not set yet,
            # TenantManager might filter out everything. We need the raw lookup.
            user = User._base_manager.get(id=user_id)
        except User.DoesNotExist:
            raise AuthenticationFailed('User not found')

        # CRITICAL: Set the context variable for the tenant manager
        # Since ContextVars are thread-local and coroutine-local, this applies
        # to all subsequent synchronous and asynchronous code executed in this context.
        current_org_id.set(str(user.org_id))

        return (user, token)
