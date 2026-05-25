from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select

from app.config import settings
from app.database import get_db, BotRecord
from app.models import ChatRequest, ChatResponse, SourceDocument
from app.services.rag import query_bot

router = APIRouter(prefix="/chat", tags=["chat"])


@router.post("", response_model=ChatResponse)
async def chat(request: ChatRequest, db: AsyncSession = Depends(get_db)):
    """
    Send a message to a bot and get a RAG-grounded answer.

    Bot selection (provide exactly one):
    - `bot_type`: uses the currently active bot for that type ("resume" or "rules")
    - `bot_id`: targets a specific bot by ID regardless of active status
    """
    print(f"\n[chat] ── incoming request ──────────────────")
    print(f"[chat] message   : {request.message!r}")
    print(f"[chat] bot_id    : {request.bot_id}")
    print(f"[chat] bot_type  : {request.bot_type}")
    print(f"[chat] history   : {len(request.chat_history)} turn(s)")

    if request.bot_id:
        result = await db.execute(
            select(BotRecord).where(BotRecord.id == request.bot_id)
        )
        bot = result.scalar_one_or_none()
        if not bot:
            print(f"[chat] ERROR: bot_id {request.bot_id!r} not found")
            raise HTTPException(status_code=404, detail="Bot not found")

    elif request.bot_type:
        result = await db.execute(
            select(BotRecord).where(
                BotRecord.bot_type == request.bot_type,
                BotRecord.is_active == True,
            )
        )
        bot = result.scalar_one_or_none()
        if not bot:
            print(f"[chat] ERROR: no active bot for type {request.bot_type!r}")
            raise HTTPException(
                status_code=404,
                detail=f"No active bot set for type '{request.bot_type}'. "
                       "Create a bot and call POST /bots/{id}/set-active first.",
            )
    else:
        print("[chat] ERROR: neither bot_id nor bot_type provided")
        raise HTTPException(
            status_code=422,
            detail="Provide either 'bot_id' or 'bot_type' in the request body.",
        )

    print(f"[chat] bot found : id={bot.id}  name={bot.name!r}  type={bot.bot_type}  status={bot.status}")

    answer, raw_sources = await query_bot(
        bot_id=bot.id,
        question=request.message,
        chat_history=request.chat_history,
    )

    print(f"[chat] answer    : {answer[:120]!r}{'…' if len(answer) > 120 else ''}")
    print(f"[chat] sources   : {len(raw_sources)} doc(s)")
    print(f"[chat] ────────────────────────────────────────\n")

    return ChatResponse(
        answer=answer,
        sources=[SourceDocument(**s) for s in raw_sources] if settings.show_sources else [],
        bot_id=bot.id,
        bot_type=bot.bot_type,
    )
