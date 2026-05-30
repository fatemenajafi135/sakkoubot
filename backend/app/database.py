from sqlalchemy.ext.asyncio import create_async_engine, async_sessionmaker, AsyncSession
from sqlalchemy.orm import DeclarativeBase, Mapped, mapped_column
from sqlalchemy import String, Boolean, DateTime, Integer, Text
from sqlalchemy.pool import NullPool
from datetime import datetime
from typing import Optional
import uuid

from app.config import settings

# Normalize the URL so users can paste the Neon string as-is:
# - postgresql:// or postgres:// → postgresql+asyncpg://
# - strip ?sslmode=require (asyncpg doesn't accept it in the URL)
_db_url = settings.db_url
for prefix in ("postgres://", "postgresql://"):
    if _db_url.startswith(prefix):
        _db_url = "postgresql+asyncpg://" + _db_url[len(prefix):]
        break
if "?" in _db_url:
    _db_url = _db_url.split("?")[0]

engine = create_async_engine(
    _db_url,
    connect_args={"ssl": True},
    poolclass=NullPool,
    echo=False,
)
AsyncSessionLocal = async_sessionmaker(engine, expire_on_commit=False)


class Base(DeclarativeBase):
    pass


class BotRecord(Base):
    __tablename__ = "bots"

    id: Mapped[str] = mapped_column(
        String(36), primary_key=True, default=lambda: str(uuid.uuid4())
    )
    name: Mapped[str] = mapped_column(String(255))
    bot_type: Mapped[str] = mapped_column(String(50))
    is_active: Mapped[bool] = mapped_column(Boolean, default=False)
    document_count: Mapped[int] = mapped_column(Integer, default=0)
    # "pending" | "indexing" | "ready" | "failed"
    status: Mapped[str] = mapped_column(String(20), default="ready")
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)
    chunking_strategy: Mapped[str] = mapped_column(String(50), default="fixed")
    chunk_delimiter: Mapped[Optional[str]] = mapped_column(String(500), nullable=True)


class JobRecord(Base):
    __tablename__ = "jobs"

    id: Mapped[str] = mapped_column(
        String(36), primary_key=True, default=lambda: str(uuid.uuid4())
    )
    bot_id: Mapped[str] = mapped_column(String(36))
    # "pending" | "indexing" | "completed" | "failed"
    status: Mapped[str] = mapped_column(String(20), default="pending")
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)
    updated_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)
    error: Mapped[Optional[str]] = mapped_column(Text, nullable=True)


async def init_db() -> None:
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)


async def get_db():
    async with AsyncSessionLocal() as session:
        yield session
