from pydantic_settings import BaseSettings, SettingsConfigDict
from typing import Literal


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        extra="ignore",
    )

    # OpenAI (or any OpenAI-compatible provider)
    openai_api_key: str
    openai_base_url: str = "https://api.openai.com/v1"
    openai_chat_model: str = "gpt-4o-mini"
    openai_embedding_model: str = "text-embedding-3-small"

    # Storage
    chroma_persist_dir: str = "./data/chroma"
    db_url: str = "sqlite+aiosqlite:///./data/sakkoubot.db"

    # RAG tuning
    chunk_size: int = 1000
    chunk_overlap: int = 200
    retrieval_k: int = 5

    # CORS
    cors_origins: list[str] = [
        "http://localhost:3000",
        "http://localhost:5173",
        "http://127.0.0.1:5500",
    ]

    # App metadata
    app_title: str = "SakkouBot API"
    app_version: str = "0.1.0"


settings = Settings()
