from pydantic import BaseModel, Field
from typing import Literal, Optional
from datetime import datetime

BotType = Literal["resume", "rules"]
ChunkingStrategy = Literal["fixed", "semantic", "whole_document", "delimiter"]


class BotResponse(BaseModel):
    id: str
    name: str
    bot_type: str
    is_active: bool
    document_count: int
    status: str
    created_at: datetime
    chunking_strategy: str = "fixed"
    chunk_delimiter: Optional[str] = None

    model_config = {"from_attributes": True}


class BotCreateResponse(BaseModel):
    bot_id: str
    job_id: str
    status: str
    name: str
    bot_type: str


class JobResponse(BaseModel):
    job_id: str
    bot_id: str
    status: str
    created_at: datetime
    updated_at: datetime
    error: Optional[str] = None

    model_config = {"from_attributes": True}


class ChatMessage(BaseModel):
    role: Literal["user", "assistant"]
    content: str


class ChatRequest(BaseModel):
    message: str = Field(..., min_length=1)
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
