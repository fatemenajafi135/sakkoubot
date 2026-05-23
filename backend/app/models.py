from pydantic import BaseModel, Field
from typing import Literal, Optional
from datetime import datetime

BotType = Literal["resume", "rules"]


class BotResponse(BaseModel):
    id: str
    name: str
    bot_type: str
    is_active: bool
    document_count: int
    created_at: datetime

    model_config = {"from_attributes": True}


class ChatMessage(BaseModel):
    role: Literal["user", "assistant"]
    content: str


class ChatRequest(BaseModel):
    message: str = Field(..., min_length=1)
    # Provide one of these to select the bot:
    # - bot_type  → uses the currently active bot for that type
    # - bot_id    → targets a specific bot regardless of active status
    bot_type: Optional[BotType] = None
    bot_id: Optional[str] = None
    chat_history: list[ChatMessage] = Field(default_factory=list)


class SourceDocument(BaseModel):
    title: str
    content: str
    loc: Optional[str] = None
    score: Optional[float] = None


class ChatResponse(BaseModel):
    answer: str
    sources: list[SourceDocument]
    bot_id: str
    bot_type: str
