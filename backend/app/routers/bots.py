from datetime import datetime
import uuid

from fastapi import APIRouter, Depends, Form, File, HTTPException, UploadFile
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, update
from typing import Optional

from app.database import get_db, BotRecord
from app.models import BotResponse, BotType
from app.services.rag import add_documents_to_bot, delete_bot_collection

router = APIRouter(prefix="/bots", tags=["bots"])


@router.post("", response_model=BotResponse, status_code=201)
async def create_bot(
    name: str = Form(..., description="Display name for this bot instance"),
    bot_type: BotType = Form(..., description="'resume' or 'rules'"),
    documents: list[UploadFile] = File(default=[], description="Documents to index (PDF, DOCX, TXT)"),
    db: AsyncSession = Depends(get_db),
):
    """
    Create a new bot and optionally upload documents to its knowledge base.
    You can create multiple bots of the same type; use /bots/{id}/set-active
    to choose which one answers chat requests.
    """
    bot_id = str(uuid.uuid4())

    doc_count = 0
    if documents:
        valid_docs = [f for f in documents if f.filename]
        if valid_docs:
            doc_count = await add_documents_to_bot(bot_id, valid_docs)

    bot = BotRecord(
        id=bot_id,
        name=name,
        bot_type=bot_type,
        document_count=doc_count,
        is_active=False,
        created_at=datetime.utcnow(),
    )
    db.add(bot)
    await db.commit()
    await db.refresh(bot)
    return BotResponse.model_validate(bot)


@router.get("", response_model=list[BotResponse])
async def list_bots(
    bot_type: Optional[BotType] = None,
    db: AsyncSession = Depends(get_db),
):
    """List all bots, optionally filtered by type."""
    stmt = select(BotRecord)
    if bot_type:
        stmt = stmt.where(BotRecord.bot_type == bot_type)
    result = await db.execute(stmt)
    return [BotResponse.model_validate(b) for b in result.scalars().all()]


@router.get("/active/{bot_type}", response_model=BotResponse)
async def get_active_bot(bot_type: BotType, db: AsyncSession = Depends(get_db)):
    """Get the currently active bot for a given type."""
    result = await db.execute(
        select(BotRecord).where(
            BotRecord.bot_type == bot_type,
            BotRecord.is_active == True,
        )
    )
    bot = result.scalar_one_or_none()
    if not bot:
        raise HTTPException(
            status_code=404, detail=f"No active bot set for type '{bot_type}'"
        )
    return BotResponse.model_validate(bot)


@router.get("/{bot_id}", response_model=BotResponse)
async def get_bot(bot_id: str, db: AsyncSession = Depends(get_db)):
    """Get a specific bot by ID."""
    result = await db.execute(select(BotRecord).where(BotRecord.id == bot_id))
    bot = result.scalar_one_or_none()
    if not bot:
        raise HTTPException(status_code=404, detail="Bot not found")
    return BotResponse.model_validate(bot)


@router.post("/{bot_id}/set-active", response_model=BotResponse)
async def set_active_bot(bot_id: str, db: AsyncSession = Depends(get_db)):
    """
    Set a bot as the active one for its type.
    Any previously active bot of the same type is deactivated.
    """
    result = await db.execute(select(BotRecord).where(BotRecord.id == bot_id))
    bot = result.scalar_one_or_none()
    if not bot:
        raise HTTPException(status_code=404, detail="Bot not found")

    # Deactivate all bots of this type first
    await db.execute(
        update(BotRecord)
        .where(BotRecord.bot_type == bot.bot_type)
        .values(is_active=False)
    )
    bot.is_active = True
    await db.commit()
    await db.refresh(bot)
    return BotResponse.model_validate(bot)


@router.post("/{bot_id}/documents", response_model=BotResponse)
async def add_documents(
    bot_id: str,
    documents: list[UploadFile] = File(...),
    db: AsyncSession = Depends(get_db),
):
    """Add more documents to an existing bot's knowledge base."""
    result = await db.execute(select(BotRecord).where(BotRecord.id == bot_id))
    bot = result.scalar_one_or_none()
    if not bot:
        raise HTTPException(status_code=404, detail="Bot not found")

    valid_docs = [f for f in documents if f.filename]
    if not valid_docs:
        raise HTTPException(status_code=422, detail="No valid documents provided")

    added = await add_documents_to_bot(bot_id, valid_docs)
    bot.document_count += added
    await db.commit()
    await db.refresh(bot)
    return BotResponse.model_validate(bot)


@router.delete("/{bot_id}", status_code=204)
async def delete_bot(bot_id: str, db: AsyncSession = Depends(get_db)):
    """Delete a bot and remove all its indexed documents."""
    result = await db.execute(select(BotRecord).where(BotRecord.id == bot_id))
    bot = result.scalar_one_or_none()
    if not bot:
        raise HTTPException(status_code=404, detail="Bot not found")

    delete_bot_collection(bot_id)
    await db.delete(bot)
    await db.commit()
