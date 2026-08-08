# Jaryan — Comprehensive Code Audit
**Date:** 2026-08-08

---

## 🔴 CRITICAL (will crash at runtime)

### C1. auth.py line 49: Syntax error (`***` placeholder)
`backend/auth.py` — line 49 contains `***` as a type annotation, which is **not valid Python**. Any import of this module will crash with a `SyntaxError`.

```python
async def get_current_user(
    authorization: *** = Header(default=None), token: Optional[str] = None
) -> User:
```

### C2. Dual backend architecture (DEADLY CONFLICT)
Two separate backends live side-by-side but only ONE is ever served:

| Aspect | FastAPI (`backend/server.py`) | Django (`backend/jaryan/settings.py`) |
|--------|-------------------------------|---------------------------------------|
| Database | MongoDB (`motor`) | PostgreSQL + MongoDB hybrid |
| Auth | JWT via `JWT_SECRET` env var | JWT via Django `SECRET_KEY` |
| Deployed? | ❌ **Never** | ✅ (gunicorn in `entrypoint.sh`) |
| Dockerfile | ❌ No FastAPI process | ✅ Django+gunicorn |

**The FastAPI codebase is dead code.** Docker runs Django+gunicorn only. All FastAPI endpoints (`server.py`) are never served.

### C3. Task data lives in TWO databases
- **`engine.py`** creates Tasks via **Django ORM** → **PostgreSQL** (`ORMTask.objects.acreate(...)`)
- **`server.py`** (FastAPI) reads/updates Tasks from **MongoDB** (`db.tasks.find(...)`)
- **Frontend** calls FastAPI endpoints → hits MongoDB → **tasks created by engine in PostgreSQL are invisible**

**Result:** Process engine runs tasks → writes to PostgreSQL → frontend queries MongoDB → sees nothing. **Process execution functionally broken.**

### C4. core/tasks.py calls advance_process with wrong signature
`backend/core/tasks.py` line 19-20:
```python
async_to_sync(advance_process)(org_id, process_id, workflow_id, node_id)
```
But `advance_process` signature is:
```python
async def advance_process(*, process_id: str, completed_node_id: str, ...)
```
**All keyword-only args.** Passing positional args will fail at runtime.

### C5. engine.py depends on Django ORM + settings
`backend/engine.py` imports directly from `core.models import User, Department, Workflow, Task as ORMTask, Organization`. This requires Django to be fully initialized (`DJANGO_SETTINGS_MODULE`). If called from FastAPI context (it is — `server.py` imports engine), Django is NOT initialized → **runtime error**.

### C6. check_timeouts() uses Django timezone
```python
from django.utils import timezone as django_timezone
```
When `check_timeouts()` is called from `cron_scheduler()` (FastAPI context), Django is not initialized → crashes.

---

## 🟠 MAJOR (functional issues in specific flows)

### M1. Two auth systems, two different secrets
- `backend/auth.py` (FastAPI): decodes JWT with `JWT_SECRET` env var
- `backend/core/auth.py` (Django DRF): decodes JWT with Django `settings.SECRET_KEY`

If these differ (they do), a token issued by FastAPI login is rejected by Django DRF.

### M2. Frontend trailing-slash interceptor
`frontend/src/lib/api.js` appends `/` to all API URLs. FastAPI treats `/path/` differently from `/path` (307 redirect). Every POST/PATCH/DELETE incurs an **extra round-trip** and might lose the request body depending on client handling.

### M3. .dockerignore excludes all *.md
Line 8: `*.md` — excludes `README.md`, `DEPLOY.md`, `SAMPLE_FLOW.md`, `RUN_WITHOUT_DOCKER.md`, and all docs/*.md from Docker build context. These files won't be available inside containers.

### M4. Test conftest references hardcoded container path
`backend/tests/conftest.py` line 10:
```python
with open("/app/frontend/.env") as f:
```
This path only exists inside Docker containers. Tests crash when run locally.

---

## 🟡 MODERATE (code quality / maintainability)

### Q1. Duplicated plan files (x3)
```
plan/design.md  ===  frontend/src/pages/plan/design.md
plan/requirements.md  ===  frontend/src/pages/plan/requirements.md
plan/tasks.md  ===  frontend/src/pages/plan/tasks.md
```
Three files duplicated verbatim. One set should be removed.

### Q2. Test report artifacts committed in git
`test_reports/` contains `iteration_*.json` (4 files), plus `pytest/` subdirectory with XML results (6 files). These are **build outputs** that should be `.gitignore`d.

### Q3. Unused / bloated dependencies
`backend/requirements.txt` includes:
- `boto3` (AWS SDK) — likely unused
- `requests-oauthlib` — unused  
- `cryptography` — unused
- `bcrypt`, `passlib` — unused (auth uses sha256 directly)
- `python-jose` — unused (uses pyjwt)
- `anthropic` — unused (uses LlmChat / httpx)
- `pandas`, `numpy` — heavy, only for analytics
- `jq` — unusual, likely unused

### Q4. generate_dataset.py at root
Large script (49KB) for generating test data. Should be in `scripts/` or `bin/`. Not harmful but messy.

### Q5. test_result.md and memory/PRD.md committed
`test_result.md` — test output artifact. `memory/PRD.md` — internal design document. Neither belongs in the repo root.

---

## 🟢 MINOR (cosmetic / suggestions)

### S1. design_guidelines.json at repo root
Design system spec (124 lines). Could live under `docs/design/` instead.

### S2. .gitignore missing entries
- `test_reports/` — should ignore generated test reports
- `memory/` (except .gitkeep) — internal scratchpad
- `test_result.md` — generated artifact
- `plan/` — already out-of-date plans

### S3. db.sqlite3 on disk (0 bytes)
Already removed from git tracking. File stub remains on disk — harmless but should be cleaned.

### S4. seed.py and seed_heavy.py both exist
`backend/seed.py` (810 lines) and `backend/seed_heavy.py` (629 lines) — two separate seed scripts. Overlapping logic. Should consolidate.

---

## 📋 SUMMARY TABLE

| ID | Severity | File | Issue |
|----|----------|------|-------|
| C1 | 🔴 CRITICAL | `auth.py:49` | `***` syntax error |
| C2 | 🔴 CRITICAL | Multiple | Dual backend (FastAPI dead, Django active) |
| C3 | 🔴 CRITICAL | `engine.py` + `server.py` | Task data split across PostgreSQL + MongoDB |
| C4 | 🔴 CRITICAL | `core/tasks.py:19-20` | Wrong arg passing to advance_process |
| C5 | 🔴 CRITICAL | `engine.py` | Django ORM dependency from FastAPI context |
| C6 | 🔴 CRITICAL | `engine.py:252` | Django timezone in FastAPI cron context |
| M1 | 🟠 MAJOR | `auth.py` vs `core/auth.py` | Two different JWT secrets |
| M2 | 🟠 MAJOR | `frontend/src/lib/api.js` | Trailing-slash on FastAPI POST |
| M3 | 🟠 MAJOR | `.dockerignore` | `*.md` blocks docs in Docker |
| M4 | 🟠 MAJOR | `tests/conftest.py` | Hardcoded Docker path |
| Q1 | 🟡 MODERATE | `plan/` + `frontend/.../plan/` | Triplicate duplicated files |
| Q2 | 🟡 MODERATE | `test_reports/` | Build artifacts in git |
| Q3 | 🟡 MODERATE | `requirements.txt` | 6+ unused packages |
| Q4 | 🟡 MODERATE | `generate_dataset.py` | Misplaced script |
| Q5 | 🟡 MODERATE | `test_result.md`, `memory/PRD.md` | Artifacts in git |
| S1 | 🟢 MINOR | `design_guidelines.json` | Misplaced |
| S2 | 🟢 MINOR | `.gitignore` | Missing entries |
| S3 | 🟢 MINOR | `db.sqlite3` | Stale file |
| S4 | 🟢 MINOR | `seed.py` + `seed_heavy.py` | Duplicate seed scripts |