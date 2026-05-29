import io
import os
import re
import tempfile
from pathlib import Path

from langchain_openai import ChatOpenAI, OpenAIEmbeddings
from langchain_chroma import Chroma
from langchain_text_splitters import RecursiveCharacterTextSplitter
from langchain_classic.chains import create_history_aware_retriever, create_retrieval_chain
from langchain_classic.chains.combine_documents import create_stuff_documents_chain
from langchain_core.prompts import ChatPromptTemplate, MessagesPlaceholder
from langchain_core.messages import HumanMessage as LCHumanMessage, AIMessage as LCAIMessage
from langchain_core.documents import Document
from langchain_community.document_loaders import PyPDFLoader, TextLoader, Docx2txtLoader
import chromadb

from app.config import settings

# ── Shared LangChain objects ──────────────────────────────────────────────────

_embeddings = OpenAIEmbeddings(
    model=settings.openai_embedding_model,
    api_key=settings.openai_api_key,
    base_url=settings.openai_base_url,
)

_llm = ChatOpenAI(
    model=settings.openai_chat_model,
    api_key=settings.openai_api_key,
    base_url=settings.openai_base_url,
    temperature=0.1,
)

def _make_splitter(strategy: str, delimiter: str | None):
    if strategy == "semantic":
        from langchain_experimental.text_splitter import SemanticChunker
        return SemanticChunker(_embeddings)
    if strategy == "delimiter":
        from langchain_text_splitters import CharacterTextSplitter
        return CharacterTextSplitter(
            separator=delimiter,
            chunk_size=10_000_000,
            chunk_overlap=0,
            is_separator_regex=False,
        )
    return RecursiveCharacterTextSplitter(
        chunk_size=settings.chunk_size,
        chunk_overlap=settings.chunk_overlap,
    )

# ── Legal-aware chunking helpers ─────────────────────────────────────────────

# Matches article headers with Persian (۰-۹ / ٠-٩) or ASCII digits
_ARTICLE_RE = re.compile(r"^\s*ماده\s+[۰-۹٠-٩\d]+", re.MULTILINE)
_ARTICLE_SPLIT_RE = re.compile(r"(?=^\s*ماده\s+[۰-۹٠-٩\d]+)", re.MULTILINE)
_CHAPTER_RE = re.compile(r"^\s*فصل\s+\S+", re.MULTILINE)

# Translate table: Persian/Arabic-Indic digits → ASCII digits
_FA_DIGITS = "۰۱۲۳۴۵۶۷۸۹٠١٢٣٤٥٦٧٨٩"
_EN_DIGITS = "01234567890123456789"
_FA_TO_EN = str.maketrans(_FA_DIGITS, _EN_DIGITS)

_LEGAL_ARTICLE_THRESHOLD = 2
# Rough upper bound before sub-splitting a single article (chars, not tokens)
_MAX_ARTICLE_CHARS = 6_000


def _normalize_digits(s: str) -> str:
    return s.translate(_FA_TO_EN)


def _build_chapter_map(text: str) -> list[tuple[int, str]]:
    """Return [(char_offset, chapter_label), ...] sorted by offset."""
    return [(m.start(), m.group().strip()) for m in _CHAPTER_RE.finditer(text)]


def _chapter_at(offset: int, chapter_map: list[tuple[int, str]]) -> str | None:
    label = None
    for pos, ch in chapter_map:
        if pos <= offset:
            label = ch
        else:
            break
    return label


def _chunk_legal_aware(docs: list) -> list:
    """
    Per-document detection and splitting:
    - Docs with ≥2 ماده markers → split by article, keep تبصره grouped.
    - Other docs → RecursiveCharacterTextSplitter fallback.
    Prepends a short identifying header to each chunk for retrieval quality.
    """
    fallback_splitter = RecursiveCharacterTextSplitter(
        chunk_size=settings.chunk_size,
        chunk_overlap=settings.chunk_overlap,
    )

    # Group pages by source file so we operate on the full document text.
    groups: dict[str, list] = {}
    for doc in docs:
        key = doc.metadata.get("source_filename", "__unknown__")
        groups.setdefault(key, []).append(doc)

    result: list[Document] = []
    legal_count = 0
    general_count = 0

    for filename, pages in groups.items():
        full_text = "\n".join(p.page_content for p in pages)
        base_meta = {k: v for k, v in pages[0].metadata.items()
                     if k not in ("page",)}

        article_matches = _ARTICLE_RE.findall(full_text)

        if len(article_matches) >= _LEGAL_ARTICLE_THRESHOLD:
            legal_count += 1
            chapter_map = _build_chapter_map(full_text)
            segments = _ARTICLE_SPLIT_RE.split(full_text)

            for seg in segments:
                seg = seg.strip()
                if not seg:
                    continue

                art_match = _ARTICLE_RE.match(seg)
                if art_match:
                    # Extract article number, normalize to ASCII
                    raw_num = re.search(r"[۰-۹٠-٩\d]+", art_match.group())
                    art_num = _normalize_digits(raw_num.group()) if raw_num else None
                    chapter = _chapter_at(full_text.find(seg), chapter_map)

                    # Build header
                    parts = [f"[{filename}]"]
                    if chapter:
                        parts.append(chapter)
                    if art_num:
                        parts.append(f"ماده {art_num}")
                    header = " · ".join(parts)
                    chunk_meta = {**base_meta, "chunk_type": "legal",
                                  "article_number": art_num, "chapter": chapter}
                else:
                    # Preamble before first ماده
                    header = f"[{filename}] · مقدمه"
                    chunk_meta = {**base_meta, "chunk_type": "legal_preamble",
                                  "article_number": None, "chapter": None}

                body = f"{header}\n\n{seg}"

                if len(seg) > _MAX_ARTICLE_CHARS:
                    # Sub-split oversized articles
                    sub_docs = fallback_splitter.create_documents([body], metadatas=[chunk_meta])
                    for i, sd in enumerate(sub_docs):
                        sd.metadata["part"] = f"{i + 1}/{len(sub_docs)}"
                        sd.metadata["raw_body"] = seg
                    result.extend(sub_docs)
                else:
                    doc = Document(page_content=body, metadata={**chunk_meta, "raw_body": seg})
                    result.append(doc)
        else:
            general_count += 1
            header = f"[{filename}]"
            headed = f"{header}\n\n{full_text}"
            sub_docs = fallback_splitter.create_documents(
                [headed], metadatas=[{**base_meta, "chunk_type": "general", "raw_body": full_text}]
            )
            result.extend(sub_docs)

    print(f"[legal_aware] classified: {legal_count} legal doc(s), {general_count} general doc(s) → {len(result)} chunks total")
    return result


# ── Prompts ───────────────────────────────────────────────────────────────────

_CONTEXTUALIZE_PROMPT = ChatPromptTemplate.from_messages([
    (
        "system",
        "Given a chat history and the latest user question which might reference "
        "context in the chat history, formulate a standalone question that can be "
        "understood without the chat history. Do NOT answer the question — just "
        "reformulate it if needed, otherwise return it as is.",
    ),
    MessagesPlaceholder("chat_history"),
    ("human", "{input}"),
])

_QA_PROMPT = ChatPromptTemplate.from_messages([
    (
        "system",
        "You are a helpful assistant for the Guilan Incubation Center (مرکز رشد گیلان). "
        "Answer the user's question using only the retrieved context below. "
        "If the answer is not in the context, say you don't know. "
        "Keep answers concise and accurate. Respond in the same language as the question.\n\n"
        "{context}",
    ),
    MessagesPlaceholder("chat_history"),
    ("human", "{input}"),
])

# ── Internal helpers ──────────────────────────────────────────────────────────

def _collection_name(bot_id: str) -> str:
    # ChromaDB collection names must be alphanumeric + underscores/hyphens
    return f"bot_{bot_id.replace('-', '_')}"


def _get_vectorstore(bot_id: str) -> Chroma:
    return Chroma(
        collection_name=_collection_name(bot_id),
        embedding_function=_embeddings,
        persist_directory=settings.chroma_persist_dir,
    )


def _load_file(path: str, filename: str):
    suffix = Path(filename).suffix.lower()
    if suffix == ".pdf":
        loader = PyPDFLoader(path)
    elif suffix in (".docx", ".doc"):
        loader = Docx2txtLoader(path)
    else:
        loader = TextLoader(path, encoding="utf-8")
    return loader.load()


# ── Public API ────────────────────────────────────────────────────────────────

async def add_documents_to_bot(bot_id: str, files: list) -> int:
    """
    Process uploaded UploadFile objects and index them into the bot's vector store.
    Returns the number of source files successfully loaded.
    """
    all_docs = []

    for file in files:
        suffix = Path(file.filename).suffix.lower()
        content = await file.read()

        with tempfile.NamedTemporaryFile(delete=False, suffix=suffix) as tmp:
            tmp.write(content)
            tmp_path = tmp.name

        try:
            docs = _load_file(tmp_path, file.filename)
            for doc in docs:
                doc.metadata["source_filename"] = file.filename
            all_docs.extend(docs)
        finally:
            os.unlink(tmp_path)

    if not all_docs:
        return 0

    chunks = _make_splitter("fixed", None).split_documents(all_docs)
    vectorstore = _get_vectorstore(bot_id)
    vectorstore.add_documents(chunks)

    return len(all_docs)


_SUPPORTED_SUFFIXES = {".pdf", ".docx", ".doc", ".txt"}


def _load_payload(payload: dict) -> list:
    """Load docs from a single file payload; expands .zip archives automatically."""
    import zipfile

    filename = payload["filename"]
    content = payload["content"]
    suffix = Path(filename).suffix.lower()

    if suffix == ".zip":
        docs = []
        with zipfile.ZipFile(io.BytesIO(content)) as zf:
            for entry in sorted(zf.namelist()):
                print(entry)
                entry_suffix = Path(entry).suffix.lower()
                if entry_suffix not in _SUPPORTED_SUFFIXES:
                    continue
                entry_name = Path(entry).name
                entry_bytes = zf.read(entry)
                with tempfile.NamedTemporaryFile(delete=False, suffix=entry_suffix) as tmp:
                    tmp.write(entry_bytes)
                    tmp_path = tmp.name
                try:
                    entry_docs = _load_file(tmp_path, entry_name)
                    for doc in entry_docs:
                        doc.metadata["source_filename"] = entry_name
                        doc.metadata["zip_source"] = filename
                    docs.extend(entry_docs)
                finally:
                    os.unlink(tmp_path)
        return docs

    with tempfile.NamedTemporaryFile(delete=False, suffix=suffix) as tmp:
        tmp.write(content)
        tmp_path = tmp.name
    try:
        docs = _load_file(tmp_path, filename)
        for doc in docs:
            doc.metadata["source_filename"] = filename
        return docs
    finally:
        os.unlink(tmp_path)


def index_documents_sync(
    bot_id: str,
    file_payloads: list[dict],
    chunking_strategy: str = "fixed",
    chunk_delimiter: str | None = None,
) -> int:
    """
    Synchronous, thread-safe document indexing.
    file_payloads: list of {"filename": str, "content": bytes}.
    ZIP archives are extracted and each supported file inside is indexed.
    Returns total number of source documents loaded.
    Safe to call from a background thread via run_in_executor.
    """
    all_docs = []
    for payload in file_payloads:
        all_docs.extend(_load_payload(payload))

    if not all_docs:
        return 0

    if chunking_strategy == "whole_document":
        chunks = all_docs
    elif chunking_strategy == "legal_aware":
        chunks = _chunk_legal_aware(all_docs)
    else:
        chunks = _make_splitter(chunking_strategy, chunk_delimiter).split_documents(all_docs)
    print(f"[chunking] strategy={chunking_strategy} {len(chunks)} chunks from {len(all_docs)} source pages")

    vectorstore = _get_vectorstore(bot_id)
    vectorstore.add_documents(chunks)

    return len(all_docs)


async def query_bot(
    bot_id: str,
    question: str,
    chat_history: list,
) -> tuple[str, list[dict]]:
    """
    Run a RAG query against a bot's vector store.
    Returns (answer_text, list_of_source_dicts).
    """
    vectorstore = _get_vectorstore(bot_id)
    retriever = vectorstore.as_retriever(search_kwargs={"k": settings.retrieval_k})

    # Build LangChain message history
    lc_history = []
    for msg in chat_history:
        if msg.role == "user":
            lc_history.append(LCHumanMessage(content=msg.content))
        else:
            lc_history.append(LCAIMessage(content=msg.content))

    history_aware_retriever = create_history_aware_retriever(
        _llm, retriever, _CONTEXTUALIZE_PROMPT
    )
    qa_chain = create_stuff_documents_chain(_llm, _QA_PROMPT)
    rag_chain = create_retrieval_chain(history_aware_retriever, qa_chain)

    result = await rag_chain.ainvoke({"input": question, "chat_history": lc_history})

    answer: str = result["answer"]
    source_docs = result.get("context", [])

    sources = []
    seen: set = set()
    for doc in source_docs:
        filename = doc.metadata.get("source_filename") or doc.metadata.get("source", "Unknown")
        page = doc.metadata.get("page", "")
        loc = f"{filename} · p.{page + 1}" if page != "" else filename
        key = (filename, str(page))
        if key not in seen:
            seen.add(key)
            sources.append(
                {
                    "title": filename,
                    "content": doc.page_content[:300],
                    "loc": loc,
                    "score": None,
                }
            )

    return answer, sources


def delete_bot_collection(bot_id: str) -> None:
    """Remove a bot's ChromaDB collection and all its embeddings."""
    try:
        client = chromadb.PersistentClient(path=settings.chroma_persist_dir)
        client.delete_collection(_collection_name(bot_id))
    except Exception:
        pass
