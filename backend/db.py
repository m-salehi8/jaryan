"""MongoDB connection and base document helpers."""

from __future__ import annotations

import os
import uuid
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Optional

from dotenv import load_dotenv
from motor.motor_asyncio import AsyncIOMotorClient, AsyncIOMotorDatabase
from pydantic import BaseModel, ConfigDict, Field

ROOT_DIR = Path(__file__).parent
load_dotenv(ROOT_DIR / ".env")

_mongo_url = os.environ["MONGO_URL"]
_db_name = os.environ["MONGO_DB_NAME"]

client: AsyncIOMotorClient = AsyncIOMotorClient(_mongo_url)
db: AsyncIOMotorDatabase = client[_db_name]


def new_id() -> str:
    return str(uuid.uuid4())


def now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


class BaseDocument(BaseModel):
    """All persisted documents use a UUID string `id` and ISO datetime strings."""

    model_config = ConfigDict(extra="ignore", populate_by_name=True)

    id: str = Field(default_factory=new_id)
    created_at: str = Field(default_factory=now_iso)
    updated_at: str = Field(default_factory=now_iso)

    @classmethod
    def from_mongo(cls, doc: Optional[dict]) -> Optional["BaseDocument"]:
        if not doc:
            return None
        doc.pop("_id", None)
        return cls(**doc)

    def to_mongo(self) -> dict[str, Any]:
        return self.model_dump()
