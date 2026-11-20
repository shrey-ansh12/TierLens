from datetime import timedelta
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from app.core.database import get_db
from app.core.security import verify_password, get_password_hash, create_access_token, decode_access_token
from app.models.relational.entities import User, Workspace, DeviceProfile
from app.schemas.auth import UserCreate, UserLogin, UserResponse, Token
from fastapi.security import OAuth2PasswordBearer

router = APIRouter(prefix="/auth", tags=["Authentication"])
oauth2_scheme = OAuth2PasswordBearer(tokenUrl="/api/v1/auth/login", auto_error=False)

async def get_current_user(
    token: str = Depends(oauth2_scheme),
    db: AsyncSession = Depends(get_db)
) -> User:
    if not token:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Authentication required. Please provide a valid Bearer token."
        )

    payload = decode_access_token(token)
    if not payload or not payload.get("sub"):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid or expired token."
        )

    user_id = payload.get("sub")
    result = await db.execute(select(User).where(User.id == user_id))
    user = result.scalars().first()
    if not user:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="User not found."
        )
    return user


async def get_user_workspace(user: User, db: AsyncSession) -> Workspace:
    """Helper to resolve or create the authenticated user's workspace."""
    stmt = select(Workspace).where(Workspace.owner_id == user.id)
    res = await db.execute(stmt)
    ws = res.scalars().first()
    if not ws:
        ws = Workspace(
            name=f"{user.full_name or 'My'}'s Workspace",
            owner_id=user.id
        )
        db.add(ws)
        await db.commit()
        await db.refresh(ws)
    return ws

@router.post("/register", response_model=Token)
async def register(user_in: UserCreate, db: AsyncSession = Depends(get_db)):
    # Check if user already exists
    existing = await db.execute(select(User).where(User.email == user_in.email))
    if existing.scalars().first():
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="A user with this email address already exists."
        )

    # Create User
    new_user = User(
        email=user_in.email,
        hashed_password=get_password_hash(user_in.password),
        full_name=user_in.full_name or user_in.email.split("@")[0]
    )
    db.add(new_user)
    await db.flush()

    # Create Default Workspace
    ws_slug = f"ws-{new_user.id[:8]}"
    default_ws = Workspace(
        name=f"{new_user.full_name}'s Workspace",
        slug=ws_slug,
        owner_id=new_user.id
    )
    db.add(default_ws)

    # Initialize default device profiles if none exist
    dp_check = await db.execute(select(DeviceProfile).limit(1))
    if not dp_check.scalars().first():
        p1 = DeviceProfile(
            name="Good Budget Tier (Galaxy A14 / Moto G)",
            tier="GOOD_BUDGET",
            platform="WEB",
            cpu_throttle_rate=4.0,
            network_profile="Fast 3G",
            viewport_width=390,
            viewport_height=844,
            ram_mb=4096
        )
        p2 = DeviceProfile(
            name="Entry-Level Tier (Redmi 9A / Nokia C)",
            tier="ENTRY_LEVEL",
            platform="WEB",
            cpu_throttle_rate=8.0,
            network_profile="Slow 3G",
            viewport_width=360,
            viewport_height=800,
            ram_mb=2048
        )
        db.add_all([p1, p2])

    await db.commit()
    await db.refresh(new_user)
    await db.refresh(default_ws)

    # Issue JWT token
    token = create_access_token({
        "sub": new_user.id,
        "email": new_user.email,
        "workspace_id": default_ws.id
    })

    return {
        "access_token": token,
        "token_type": "bearer",
        "user": new_user,
        "workspace_id": default_ws.id
    }

@router.post("/login", response_model=Token)
async def login(credentials: UserLogin, db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(User).where(User.email == credentials.email))
    user = result.scalars().first()

    if not user or not verify_password(credentials.password, user.hashed_password):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Incorrect email or password."
        )

    # Fetch workspace
    ws_res = await db.execute(select(Workspace).where(Workspace.owner_id == user.id))
    ws = ws_res.scalars().first()
    workspace_id = ws.id if ws else ""

    token = create_access_token({
        "sub": user.id,
        "email": user.email,
        "workspace_id": workspace_id
    })

    return {
        "access_token": token,
        "token_type": "bearer",
        "user": user,
        "workspace_id": workspace_id
    }

@router.get("/me", response_model=UserResponse)
async def me(current_user: User = Depends(get_current_user)):
    return current_user
