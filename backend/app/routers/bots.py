import asyncio
from datetime import datetime
import uuid

from fastapi import APIRouter, BackgroundTasks, Depends, Form, File, HTTPException, UploadFile
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, update
from typing import Optional, List

from app.database import get_db, BotRecord, JobRecord, AsyncSessionLocal
from app.models import BotResponse, BotCreateResponse, BotType
from app.services.rag import index_documents_sync, delete_bot_collection

router = APIRouter(prefix="/bots", tags=["bots"])


async def _run_indexing(
    bot_id: str,
    job_id: str,
    file_payloads: list[dict],
    directory_path: str | None,
    increment: bool = False,
) -> None:
    """Background task: runs document indexing in a thread, updates job + bot status in DB."""
    async with AsyncSessionLocal() as db:
        await db.execute(
            update(BotRecord).where(BotRecord.id == bot_id).values(status="indexing")
        )
        await db.execute(
            update(JobRecord).where(JobRecord.id == job_id).values(
                status="indexing", updated_at=datetime.utcnow()
            )
        )
        await db.commit()

    try:
        loop = asyncio.get_event_loop()
        count = await loop.run_in_executor(
            None, index_documents_sync, bot_id, file_payloads, directory_path
        )

        async with AsyncSessionLocal() as db:
            if increment:
                result = await db.execute(select(BotRecord).where(BotRecord.id == bot_id))
                bot = result.scalar_one()
                bot.document_count += count
                bot.status = "ready"
            else:
                await db.execute(
                    update(BotRecord).where(BotRecord.id == bot_id).values(
                        status="ready", document_count=count
                    )
                )
            await db.execute(
                update(JobRecord).where(JobRecord.id == job_id).values(
                    status="completed", updated_at=datetime.utcnow()
                )
            )
            await db.commit()

    except Exception as exc:
        async with AsyncSessionLocal() as db:
            await db.execute(
                update(BotRecord).where(BotRecord.id == bot_id).values(status="failed")
            )
            await db.execute(
                update(JobRecord).where(JobRecord.id == job_id).values(
                    status="failed", updated_at=datetime.utcnow(), error=str(exc)
                )
            )
            await db.commit()


@router.post("", response_model=BotCreateResponse, status_code=202)
async def create_bot(
    background_tasks: BackgroundTasks,
    name: str = Form(..., description="Display name for this bot instance"),
    bot_type: BotType = Form(..., description="'resume' or 'rules'"),
    documents: Optional[List[UploadFile]] = File(default=None, description="Upload files directly (PDF, DOCX, TXT)"),
    directory_path: Optional[str] = Form(None, description="Server-side directory path — all supported docs inside will be ingested recursively"),
    db: AsyncSession = Depends(get_db),
):
    """
    Create a new bot. Returns immediately with a `bot_id` and `job_id`.

    Document indexing runs in the background — poll `GET /jobs/{job_id}` to track progress.
    The bot is ready to chat once `job.status == "completed"`.

    Two ways to add documents (can be combined):
    - **documents**: upload individual files (PDF, DOCX, TXT)
    - **directory_path**: path to a folder on the server — every PDF/DOCX/TXT inside is indexed recursively
    """
    # Read file bytes NOW, while still inside the async request handler
    file_payloads = []
    for f in (documents or []):
        if f.filename:
            content = await f.read()
            file_payloads.append({"filename": f.filename, "content": content})

    if not file_payloads and not directory_path:
        raise HTTPException(
            status_code=422,
            detail="Provide at least one of: documents (file upload), directory_path",
        )

    bot_id = str(uuid.uuid4())
    job_id = str(uuid.uuid4())

    bot = BotRecord(
        id=bot_id,
        name=name,
        bot_type=bot_type,
        document_count=0,
        is_active=False,
        status="pending",
        created_at=datetime.utcnow(),
    )
    job = JobRecord(
        id=job_id,
        bot_id=bot_id,
        status="pending",
        created_at=datetime.utcnow(),
        updated_at=datetime.utcnow(),
    )
    db.add(bot)
    db.add(job)
    await db.commit()

    background_tasks.add_task(
        _run_indexing, bot_id, job_id, file_payloads, directory_path, False
    )

    return BotCreateResponse(
        bot_id=bot_id,
        job_id=job_id,
        status="pending",
        name=name,
        bot_type=bot_type,
    )


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
    if bot.status != "ready":
        raise HTTPException(
            status_code=409,
            detail=f"Bot is not ready yet (status: {bot.status}). Wait for indexing to complete.",
        )

    await db.execute(
        update(BotRecord)
        .where(BotRecord.bot_type == bot.bot_type)
        .values(is_active=False)
    )
    bot.is_active = True
    await db.commit()
    await db.refresh(bot)
    return BotResponse.model_validate(bot)


@router.post("/{bot_id}/documents", response_model=BotCreateResponse, status_code=202)
async def add_documents(
    bot_id: str,
    background_tasks: BackgroundTasks,
    documents: Optional[List[UploadFile]] = File(default=None, description="Upload files directly (PDF, DOCX, TXT)"),
    directory_path: Optional[str] = Form(None, description="Server-side directory path — all supported docs inside will be ingested recursively"),
    db: AsyncSession = Depends(get_db),
):
    """
    Add more documents to an existing bot. Returns immediately with a `job_id`.
    Poll `GET /jobs/{job_id}` to track indexing progress.
    """
    result = await db.execute(select(BotRecord).where(BotRecord.id == bot_id))
    bot = result.scalar_one_or_none()
    if not bot:
        raise HTTPException(status_code=404, detail="Bot not found")

    file_payloads = []
    for f in (documents or []):
        if f.filename:
            content = await f.read()
            file_payloads.append({"filename": f.filename, "content": content})

    if not file_payloads and not directory_path:
        raise HTTPException(
            status_code=422,
            detail="Provide at least one of: documents (file upload), directory_path",
        )

    job_id = str(uuid.uuid4())
    job = JobRecord(
        id=job_id,
        bot_id=bot_id,
        status="pending",
        created_at=datetime.utcnow(),
        updated_at=datetime.utcnow(),
    )
    bot.status = "pending"
    db.add(job)
    await db.commit()

    background_tasks.add_task(
        _run_indexing, bot_id, job_id, file_payloads, directory_path, True
    )

    return BotCreateResponse(
        bot_id=bot_id,
        job_id=job_id,
        status="pending",
        name=bot.name,
        bot_type=bot.bot_type,
    )


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
