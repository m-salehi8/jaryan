import os
import pytest
import requests

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL")
if not BASE_URL:
    # Fallback: read from frontend env
    try:
        with open("/app/frontend/.env") as f:
            for line in f:
                if line.startswith("REACT_APP_BACKEND_URL="):
                    BASE_URL = line.strip().split("=", 1)[1]
                    break
    except Exception:
        pass
BASE_URL = (BASE_URL or "").rstrip("/")


@pytest.fixture(scope="session")
def base_url():
    return BASE_URL


@pytest.fixture(scope="session")
def session():
    s = requests.Session()
    s.headers.update({"Content-Type": "application/json"})
    return s


def _login(session, email, password):
    r = session.post(f"{BASE_URL}/api/auth/login", json={"email": email, "password": password})
    return r


@pytest.fixture(scope="session")
def admin_token(session):
    r = _login(session, "admin@raahkar.ir", "admin1234")
    assert r.status_code == 200, f"admin login failed: {r.status_code} {r.text}"
    return r.json()["token"]


@pytest.fixture(scope="session")
def designer_token(session):
    r = _login(session, "designer@raahkar.ir", "1234")
    assert r.status_code == 200, f"designer login failed: {r.status_code} {r.text}"
    return r.json()["token"]


@pytest.fixture(scope="session")
def manager_token(session):
    r = _login(session, "manager@raahkar.ir", "1234")
    assert r.status_code == 200, f"manager login failed: {r.status_code} {r.text}"
    return r.json()["token"]


@pytest.fixture(scope="session")
def employee_token(session):
    r = _login(session, "employee@raahkar.ir", "1234")
    assert r.status_code == 200, f"employee login failed: {r.status_code} {r.text}"
    return r.json()["token"]


def auth_headers(token):
    return {"Authorization": f"Bearer {token}"}
