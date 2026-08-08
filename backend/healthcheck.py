#!/usr/bin/env python3
"""Health check script for the Django backend."""
import urllib.request
import urllib.error
import sys

try:
    urllib.request.urlopen('http://localhost:8000/api/auth/login/', timeout=5)
    sys.exit(0)
except urllib.error.HTTPError:
    # Any HTTP response (even 4xx/5xx) means server is UP
    sys.exit(0)
except Exception:
    # Connection refused, timeout, etc. = server is DOWN
    sys.exit(1)
