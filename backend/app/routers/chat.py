from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select

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
    if request.bot_id:
        result = await db.execute(
            select(BotRecord).where(BotRecord.id == request.bot_id)
        )
        bot = result.scalar_one_or_none()
        if not bot:
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
            raise HTTPException(
                status_code=404,
                detail=f"No active bot set for type '{request.bot_type}'. "
                       "Create a bot and call POST /bots/{id}/set-active first.",
            )
    else:
        raise HTTPException(
            status_code=422,
            detail="Provide either 'bot_id' or 'bot_type' in the request body.",
        )

    answer, raw_sources = await query_bot(
        bot_id=bot.id,
        question=request.message,
        chat_history=request.chat_history,
    )

    return ChatResponse(
        answer=answer,
        sources=[SourceDocument(**s) for s in raw_sources],
        bot_id=bot.id,
        bot_type=bot.bot_type,
    )
