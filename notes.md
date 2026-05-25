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
    ├── database.py             # SQLAlchemy async engine + BotRecord + JobRecord tables
    ├── models.py               # Pydantic request/response schemas
    ├── main.py                 # FastAPI app, CORS middleware, lifespan, OpenAPI schema patch
    ├── routers/
    │   ├── bots.py             # bot management endpoints (async, returns 202 + job_id)
    │   ├── chat.py             # chat endpoint
    │   └── jobs.py             # job status endpoints
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
| Semantic chunking | langchain-experimental (SemanticChunker) |

---

### API endpoints

| Method | Path | Description |
|---|---|---|
| `POST` | `/bots` | Create a bot; seed docs via file upload and/or a server-side directory path |
| `GET` | `/bots` | List all bots (filterable by `?bot_type=`) |
| `GET` | `/bots/{id}` | Get a specific bot |
| `POST` | `/bots/{id}/set-active` | Set this bot as the active one for its type |
| `GET` | `/bots/active/{bot_type}` | Get the currently active bot for a type |
| `POST` | `/bots/{id}/documents` | Upload files or point to a server-side directory (async, returns job_id) |
| `DELETE` | `/bots/{id}` | Delete a bot and its vector store |
| `POST` | `/chat` | Send a message; select bot by `bot_type` or `bot_id` |
| `GET` | `/jobs/{job_id}` | Poll background indexing job status |
| `GET` | `/jobs?bot_id=` | List all jobs for a bot |
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

**At least one document required on bot creation**
`POST /bots` now rejects with HTTP 422 if neither `documents` nor `directory_path` is provided. Previously a bot could be created with no documents and would silently enter `status="ready"` with an empty vector store. The `has_docs` conditional branch is gone — indexing always runs on create.

**Source document visibility toggle**
`SHOW_SOURCES` (`.env`, default `false`) controls whether the `sources` array in `POST /chat` responses is populated. When `false`, the array is always empty — the RAG retrieval still runs, only the response payload changes. Set `SHOW_SOURCES=true` to expose source titles, page numbers, and 300-char excerpts to the frontend.

**Swagger UI file picker fix**
FastAPI + Pydantic v2 emits `contentMediaType: application/octet-stream` for `UploadFile` fields (OpenAPI 3.1 style), but Swagger UI only renders a file-picker widget for `format: binary` (OpenAPI 3.0 style). Fixed in `main.py` via a custom `openapi()` override (`_patch_file_fields`) that post-processes the generated schema: replaces `contentMediaType` with `format: binary` and flattens `anyOf: [array, null]` into `array + nullable: true`. The app now serves OpenAPI 3.0.2.

**Async bot creation (background indexing)**
`POST /bots` and `POST /bots/{id}/documents` return HTTP 202 immediately with `{bot_id, job_id, status: "pending"}`. Document chunking and OpenAI embedding run in a background thread via FastAPI `BackgroundTasks` + `run_in_executor`. Poll `GET /jobs/{job_id}` to track progress (`pending → indexing → completed / failed`). The bot's `status` field mirrors this: `pending → indexing → ready / failed`. `POST /bots/{id}/set-active` rejects with 409 if the bot is not yet `ready`.

**Per-bot chunking strategies**
`POST /bots` accepts an optional `chunking_strategy` form field (default: `"fixed"`) and `chunk_delimiter`. Four strategies are supported:
- `fixed` — `RecursiveCharacterTextSplitter` using `CHUNK_SIZE` / `CHUNK_OVERLAP` from config (original behaviour)
- `semantic` — `SemanticChunker` from `langchain-experimental`; splits at natural semantic boundaries by calling the embedding model during ingestion
- `whole_document` — each uploaded file is stored as a single chunk, no splitting
- `delimiter` — `CharacterTextSplitter` splits on an arbitrary string (`chunk_delimiter`); requires `chunk_delimiter` to be provided (422 otherwise)

The strategy and delimiter are persisted on `BotRecord` (`chunking_strategy`, `chunk_delimiter` columns). `POST /bots/{id}/documents` reuses the bot's stored strategy automatically so incremental uploads are consistent.

> **DB migration note:** `create_all()` does not alter existing tables. Delete `data/sakkoubot.db` once after deploying this change so the new columns are created.

**Chunk debug logging**
`index_documents_sync` prints the total chunk count and the first 50 chars of each chunk to stdout during indexing — useful for verifying documents are parsed and split correctly.

**Frontend ↔ Backend connection**
`chat.jsx` now fetches `GET /bots/active/{bot_type}` on mount to resolve the real bot UUID, then sends `bot_id: <uuid>` (not `bot_type`) in every `POST /chat` request. The send button is disabled and a Persian error message is shown if no active bot is found.

**Backend chat request logging**
`chat.py` prints every incoming request (message, bot_id/bot_type, history length), the resolved bot (id, name, type, status), the first 120 chars of the answer, and source count to the uvicorn terminal — allows verifying frontend↔backend traffic without touching the browser.

**Frontend render-loop fix (browser warning spam)**
`onMessagesChange` in `app.jsx` was a plain inline function — recreated on every render. Because it was listed in Chat's `useEffect` dependency array, every `setHistories` call triggered the effect again, creating an infinite update loop and hundreds of console warnings. Fixed by wrapping it in `React.useCallback([activeBot])` so its reference is stable within a session.

**Chat component remount fix**
`Chat` was keyed as `` `${activeBot}-${activeSessionId}-${sessionVersion}` ``. When the first message was sent, `onMessagesChange` created a new session and called `setActiveSessionId`, changing the key and causing React to **unmount the Chat mid-request** — killing the in-flight API call and wiping all state. Fixed by removing `activeSessionId` from the key: `` `${activeBot}-${sessionVersion}` ``. Only intentional navigation (new chat, select session, switch bot) now remounts Chat.

**Storage**
- Bot metadata (id, name, type, active flag, document count, status) lives in SQLite.
- Indexing job records (id, bot_id, status, error) also in SQLite (`jobs` table).
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
| `OPENAI_BASE_URL` | `https://api.openai.com/v1` | AI provider base URL — swap to use any OpenAI-compatible endpoint |
| `OPENAI_CHAT_MODEL` | `gpt-4o-mini` | LLM model |
| `OPENAI_EMBEDDING_MODEL` | `text-embedding-3-small` | Embedding model |
| `CHUNK_SIZE` | `1000` | Document chunk size (chars) |
| `CHUNK_OVERLAP` | `200` | Chunk overlap |
| `RETRIEVAL_K` | `5` | Number of chunks retrieved per query |
| `SHOW_SOURCES` | `false` | Include retrieved source excerpts in chat responses |
| `CHROMA_PERSIST_DIR` | `./data/chroma` | ChromaDB storage path |
| `DB_URL` | `sqlite+aiosqlite:///./data/sakkoubot.db` | SQLite path |
| `CORS_ORIGINS` | localhost variants | Allowed frontend origins |
