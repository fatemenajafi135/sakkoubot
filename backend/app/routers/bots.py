from datetime import datetime
import uuid

from fastapi import APIRouter, Depends, Form, File, HTTPException, UploadFile
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, update
from typing import Optional

from app.database import get_db, BotRecord
from app.models import BotResponse, BotType
from app.services.rag import add_documents_to_bot, add_documents_from_directory, delete_bot_collection

router = APIRouter(prefix="/bots", tags=["bots"])


@router.post("", response_model=BotResponse, status_code=201)
async def create_bot(
    name: str = Form(..., description="Display name for this bot instance"),
    bot_type: BotType = Form(..., description="'resume' or 'rules'"),
    documents: list[UploadFile] = File(default=[], description="Upload files directly (PDF, DOCX, TXT)"),
    directory_path: Optional[str] = Form(None, description="Server-side directory path — all supported docs inside will be ingested recursively"),
    db: AsyncSession = Depends(get_db),
):
    """
    Create a new bot and optionally seed its knowledge base.

    Two ways to add documents (can be combined):
    - **documents**: upload individual files (PDF, DOCX, TXT)
    - **directory_path**: path to a folder on the server — every PDF/DOCX/TXT inside is indexed recursively

    You can create multiple bots of the same type; use POST /bots/{id}/set-active
    to choose which one answers chat requests.
    """
    bot_id = str(uuid.uuid4())

    doc_count = 0
    if documents:
        valid_docs = [f for f in documents if f.filename]
        if valid_docs:
            doc_count += await add_documents_to_bot(bot_id, valid_docs)

    if directory_path:
        try:
            doc_count += add_documents_from_directory(bot_id, directory_path)
        except ValueError as exc:
            raise HTTPException(status_code=400, detail=str(exc))

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
    documents: list[UploadFile] = File(default=[], description="Upload files directly (PDF, DOCX, TXT)"),
    directory_path: Optional[str] = Form(None, description="Server-side directory path — all supported docs inside will be ingested recursively"),
    db: AsyncSession = Depends(get_db),
):
    """
    Add more documents to an existing bot's knowledge base.

    Two ways to add documents (can be combined):
    - **documents**: upload individual files (PDF, DOCX, TXT)
    - **directory_path**: path to a folder on the server — every PDF/DOCX/TXT inside is indexed recursively
    """
    result = await db.execute(select(BotRecord).where(BotRecord.id == bot_id))
    bot = result.scalar_one_or_none()
    if not bot:
        raise HTTPException(status_code=404, detail="Bot not found")

    valid_docs = [f for f in documents if f.filename]
    if not valid_docs and not directory_path:
        raise HTTPException(
            status_code=422,
            detail="Provide at least one of: documents (file upload), directory_path",
        )

    added = 0
    if valid_docs:
        added += await add_documents_to_bot(bot_id, valid_docs)

    if directory_path:
        try:
            added += add_documents_from_directory(bot_id, directory_path)
        except ValueError as exc:
            raise HTTPException(status_code=400, detail=str(exc))

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
