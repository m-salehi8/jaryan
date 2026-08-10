"""MongoDB access for the process engine.

Motor binds a client to the event loop that first used it. The rest of the app
is served by *synchronous* gunicorn workers (see entrypoint.sh) and reaches
async engine code through ``async_to_sync``, which spins up a **new** event
loop for every call and closes it afterwards. A single module-level client
therefore worked exactly once per worker process: every later call raised
``RuntimeError: Event loop is closed`` from deep inside motor, breaking
``advance_process``, task completion, the dashboard process counter and the
Celery beat tasks.

The fix is to key the cached client on the running loop, so each
``async_to_sync`` call gets a client bound to its own loop while genuinely
async callers (ASGI, or several awaits inside one loop) still reuse one client
and its connection pool.
"""

import asyncio
import weakref

from motor.motor_asyncio import AsyncIOMotorClient
from django.conf import settings

# loop → (client, db). Weak keys so a closed loop's client is dropped with it
# rather than leaking a connection pool per request.
_clients: "weakref.WeakKeyDictionary" = weakref.WeakKeyDictionary()

# Used when get_db() is called outside a running loop, e.g. from a management
# command that then drives the coroutine itself.
_fallback = None


def _make_client():
    client = AsyncIOMotorClient(settings.MONGO_URL)
    return client, client[settings.MONGO_DB_NAME]


def get_db():
    """Return a database handle bound to the caller's event loop."""
    global _fallback

    try:
        loop = asyncio.get_running_loop()
    except RuntimeError:
        # No loop running yet. Whatever loop later drives the coroutine will
        # call get_db() again through the engine, so this handle is only a
        # placeholder for synchronous inspection.
        if _fallback is None:
            _fallback = _make_client()
        return _fallback[1]

    entry = _clients.get(loop)
    if entry is None:
        entry = _make_client()
        _clients[loop] = entry
    return entry[1]


def init_mongo():
    """Kept for backwards compatibility; get_db() now initialises on demand."""
    get_db()
