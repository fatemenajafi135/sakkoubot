# SakkouBot — Development Notes

## What was built

### Backend (Python / FastAPI / uv)

A full RAG-powered backend for SakkouBot, serving two chatbot types:
- **resume** — answers questions based on member resumes
- **rules** — answers questions based on Guilan Incubation Center regulations

---

### Project structure

```
backend/
├── pyproject.toml              # uv project manifest + dependencies
├── .env.example                # environment variable template
├── data/                       # runtime storage (gitignored)
│   ├── chroma/                 # ChromaDB vector store persistence
│   └── sakkoubot.db            # SQLite database
└── app/
    ├── config.py               # all settings via pydantic-settings (.env)
    ├── database.py             # SQLAlchemy async engine + BotRecord table
    ├── models.py               # Pydantic request/response schemas
    ├── main.py                 # FastAPI app, CORS middleware, lifespan
    ├── routers/
    │   ├── bots.py             # bot management endpoints
    │   └── chat.py             # chat endpoint
    └── services/
        └── rag.py              # LangChain + ChromaDB RAG pipeline
```

---

### Tech stack

| Layer | Choice |
|---|---|
| Package manager | uv |
| Web framework | FastAPI |
| LLM | OpenAI (gpt-4o-mini by default) |
| Embeddings | OpenAI (text-embedding-3-small) |
| RAG orchestration | LangChain (langchain-classic chains) |
| Vector store | ChromaDB (persistent, one collection per bot) |
| Metadata DB | SQLite via SQLAlchemy async |
| Document loaders | PyPDF, Docx2txt, TextLoader (langchain-community) |

---

### API endpoints

| Method | Path | Description |
|---|---|---|
| `POST` | `/bots` | Create a bot; seed docs via file upload and/or a server-side directory path |
| `GET` | `/bots` | List all bots (filterable by `?bot_type=`) |
| `GET` | `/bots/{id}` | Get a specific bot |
| `POST` | `/bots/{id}/set-active` | Set this bot as the active one for its type |
| `GET` | `/bots/active/{bot_type}` | Get the currently active bot for a type |
| `POST` | `/bots/{id}/documents` | Upload files or point to a server-side directory |
| `DELETE` | `/bots/{id}` | Delete a bot and its vector store |
| `POST` | `/chat` | Send a message; select bot by `bot_type` or `bot_id` |
| `GET` | `/health` | Health check |

---

### Key design decisions

**Multiple bots per type, one active at a time**
You can create as many `resume` or `rules` bots as you want (e.g. different document sets, versions). `POST /bots/{id}/set-active` switches which one handles chat — it deactivates the previous active bot of that type automatically.

**Bot selection in chat**
The chat endpoint accepts either:
- `bot_type`: routes to the currently active bot for that type
- `bot_id`: targets a specific bot directly, regardless of active status

**RAG pipeline**
Uses LangChain's history-aware retrieval (LCEL):
1. A contextualization prompt rewrites the user question using chat history into a standalone query.
2. ChromaDB retrieves the top-k relevant chunks.
3. A QA prompt feeds the context + history to the LLM to produce a grounded answer.
4. Source documents (filename, page, excerpt) are returned alongside the answer.

**Document ingestion — two modes**
Both `POST /bots` and `POST /bots/{id}/documents` accept:
- `documents` (multipart file upload) — individual PDF/DOCX/TXT files selected via file picker
- `directory_path` (form string) — a server-side folder; all supported files inside are indexed **recursively**

Both can be used together in one request; counts accumulate. Bad paths return HTTP 400.

**Swagger UI file picker fix**
FastAPI + Pydantic v2 emits `contentMediaType: application/octet-stream` for `UploadFile` fields (OpenAPI 3.1 style), but Swagger UI only renders a file-picker widget for `format: binary` (OpenAPI 3.0 style). Fixed in `main.py` via a custom `openapi()` override (`_patch_file_fields`) that post-processes the generated schema: replaces `contentMediaType` with `format: binary` and flattens `anyOf: [array, null]` into `array + nullable: true`. The app now serves OpenAPI 3.0.2.

**Storage**
- Bot metadata (id, name, type, active flag, document count) lives in SQLite.
- Embeddings live in ChromaDB under a collection named `bot_{id}`.
- Deleting a bot cleans up both.

---

### How to run

```bash
cd backend
cp .env.example .env      # add your OPENAI_API_KEY
uv sync                   # install dependencies
uv run uvicorn app.main:app --reload
# Swagger UI at http://localhost:8000/docs
```

### config.py tunables (via .env)

| Variable | Default | Description |
|---|---|---|
| `OPENAI_API_KEY` | — | Required |
| `OPENAI_CHAT_MODEL` | `gpt-4o-mini` | LLM model |
| `OPENAI_EMBEDDING_MODEL` | `text-embedding-3-small` | Embedding model |
| `CHUNK_SIZE` | `1000` | Document chunk size (chars) |
| `CHUNK_OVERLAP` | `200` | Chunk overlap |
| `RETRIEVAL_K` | `5` | Number of chunks retrieved per query |
| `CHROMA_PERSIST_DIR` | `./data/chroma` | ChromaDB storage path |
| `DB_URL` | `sqlite+aiosqlite:///./data/sakkoubot.db` | SQLite path |
| `CORS_ORIGINS` | localhost variants | Allowed frontend origins |
