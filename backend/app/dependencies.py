"""
Dependencies: JWT authentication, role guards, DB session.
"""
from typing import Annotated

from fastapi import Depends, HTTPException, status
from fastapi.security import OAuth2PasswordBearer
from sqlalchemy.orm import Session

from app.database import get_db
from app.models import User, UserRole, UserStatus
from app.security import decode_token

oauth2_scheme = OAuth2PasswordBearer(tokenUrl="/api/auth/login")


def get_current_user(
    token: Annotated[str, Depends(oauth2_scheme)],
    db: Session = Depends(get_db),
) -> User:
    credentials_exc = HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail="Could not validate credentials",
        headers={"WWW-Authenticate": "Bearer"},
    )
    payload = decode_token(token)
    if payload is None:
        raise credentials_exc

    user_id: int = payload.get("sub")
    if user_id is None:
        raise credentials_exc

    user = db.query(User).filter(User.id == int(user_id)).first()
    if user is None:
        raise credentials_exc
    return user


def require_admin(current_user: User = Depends(get_current_user)) -> User:
    if current_user.role != UserRole.admin:
        raise HTTPException(status_code=403, detail="Admin access required")
    return current_user


def require_therapist(current_user: User = Depends(get_current_user)) -> User:
    if current_user.role != UserRole.therapist:
        raise HTTPException(status_code=403, detail="Therapist access required")
    return current_user


def require_active(current_user: User = Depends(get_current_user)) -> User:
    if current_user.status == UserStatus.on_leave:
        raise HTTPException(status_code=403, detail="Account is on leave")
    return current_user
