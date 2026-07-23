from .models import current_org_id

class TenantContextMiddleware:
    def __init__(self, get_response):
        self.get_response = get_response

    def __call__(self, request):
        # We process the request down the middleware chain.
        # The DRF authentication will run during view processing and set the context var.
        response = self.get_response(request)

        # Clear the context var to prevent leakage to other requests handled by the same thread/worker.
        current_org_id.set(None)

        return response
