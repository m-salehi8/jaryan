"""Lightweight JWT auth for Jaryan (per user choice: very simple)."""
from __future__ import annotations

import hashlib
import os
from datetime import datetime, timedelta, timezone
from typing import Optional

import jwt
from fastapi import Depends, Header, HTTPException, status

from db import db
from models import User, UserPublic

JWT_SECRET = os.environ["JWT_SECRET"]
JWT_ALG = "HS256"
JWT_TTL_HOURS = 24 * 14


def hash_password(plain: str) -> str:
    # Per user request: "very very simple". sha256 is fine for the demo.
    return hashlib.sha256(plain.encode("utf-8")).hexdigest()


def verify_password(plain: str, hashed: str) -> bool:
    return hash_password(plain) == hashed


def make_token(user_id: str, org_id: str) -> str:
    payload = {
        "sub": user_id,
        "org": org_id,
        "exp": datetime.now(timezone.utc) + timedelta(hours=JWT_TTL_HOURS),
    }
    return jwt.encode(payload, JWT_SECRET, algorithm=JWT_ALG)


def decode_token(token: str) -> dict:
    try:
        return jwt.decode(token, JWT_SECRET, algorithms=[JWT_ALG])
    except jwt.PyJWTError as exc:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="invalid_token") from exc


async def get_current_user(
    authorization: Optional[str] = Header(default=None),
    token: Optional[str] = None
) -> User:
    if not authorization and not token:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="missing_token")
    
    auth_token = token
    if authorization and authorization.lower().startswith("bearer "):
        auth_token = authorization.split(" ", 1)[1].strip()
        
    if not auth_token:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="invalid_token_format")

    payload = decode_token(auth_token)
    user_doc = await db.users.find_one({"id": payload["sub"]}, {"_id": 0})
    if not user_doc:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="user_not_found")
    return User(**user_doc)


def public_user(user: User) -> UserPublic:
    return UserPublic(
        id=user.id,
        org_id=user.org_id,
        email=user.email,
        full_name=user.full_name,
        role=user.role,
        avatar_color=user.avatar_color,
    )


CurrentUser = Depends(get_current_user)
