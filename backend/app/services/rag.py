import os
import tempfile
from pathlib import Path

from langchain_openai import ChatOpenAI, OpenAIEmbeddings
from langchain_chroma import Chroma
from langchain_text_splitters import RecursiveCharacterTextSplitter
from langchain_classic.chains import create_history_aware_retriever, create_retrieval_chain
from langchain_classic.chains.combine_documents import create_stuff_documents_chain
from langchain_core.prompts import ChatPromptTemplate, MessagesPlaceholder
from langchain_core.messages import HumanMessage as LCHumanMessage, AIMessage as LCAIMessage
from langchain_community.document_loaders import PyPDFLoader, TextLoader, Docx2txtLoader
import chromadb

from app.config import settings

# ── Shared LangChain objects ──────────────────────────────────────────────────

_embeddings = OpenAIEmbeddings(
    model=settings.openai_embedding_model,
    api_key=settings.openai_api_key,
)

_llm = ChatOpenAI(
    model=settings.openai_chat_model,
    api_key=settings.openai_api_key,
    temperature=0.1,
)

_splitter = RecursiveCharacterTextSplitter(
    chunk_size=settings.chunk_size,
    chunk_overlap=settings.chunk_overlap,
)

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

    chunks = _splitter.split_documents(all_docs)
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
