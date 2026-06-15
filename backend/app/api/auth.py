"""Authentication routes — Google OAuth with proper verification."""

from fastapi import APIRouter, Depends, HTTPException
from google.oauth2 import id_token
from google.auth.transport import requests as google_requests
from pydantic import BaseModel
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import settings
from app.core.database import get_db
from app.core.security import create_access_token, hash_jwt, get_current_user
from app.models.models import User, AuthSession

router = APIRouter()


class GoogleAuthRequest(BaseModel):
    credential: str  # Google ID token from @react-oauth/google


class SessionResponse(BaseModel):
    user_id: str
    email: str
    name: str
    avatar_url: str | None = None
    token: str


@router.post("/google", response_model=SessionResponse)
async def google_auth(req: GoogleAuthRequest, db: AsyncSession = Depends(get_db)):
    """Verify Google ID token with Google's servers, upsert user, return JWT."""
    try:
        id_info = id_token.verify_oauth2_token(
            req.credential,
            google_requests.Request(),
            settings.GOOGLE_CLIENT_ID,
        )
    except ValueError as e:
        raise HTTPException(status_code=401, detail=f"Invalid Google token: {e}")

    email = id_info.get("email")
    name = id_info.get("name", email)
    picture = id_info.get("picture")

    if not email:
        raise HTTPException(status_code=401, detail="Email not found in token")

    # Upsert user
    result = await db.execute(select(User).where(User.email == email))
    user = result.scalar_one_or_none()

    if user is None:
        user = User(email=email, name=name, avatar_url=picture)
        db.add(user)
        await db.flush()
    else:
        user.name = name
        user.avatar_url = picture

    # Create JWT
    token = create_access_token(user.id, user.email)

    # Store session
    session = AuthSession(user_id=user.id, jwt_hash=hash_jwt(token))
    db.add(session)

    return SessionResponse(
        user_id=user.id,
        email=user.email,
        name=user.name,
        avatar_url=user.avatar_url,
        token=token,
    )


@router.get("/session", response_model=SessionResponse)
async def get_session(
    current_user: dict = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Return current session info from JWT."""
    result = await db.execute(select(User).where(User.id == current_user["user_id"]))
    user = result.scalar_one_or_none()
    if not user:
        raise HTTPException(status_code=404, detail="User not found")

    return SessionResponse(
        user_id=user.id,
        email=user.email,
        name=user.name,
        avatar_url=user.avatar_url,
        token="",  # Don't return token on session lookup
    )
