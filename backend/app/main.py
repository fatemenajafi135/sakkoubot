from contextlib import asynccontextmanager
from pathlib import Path
from typing import Any

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.openapi.utils import get_openapi

from app.config import settings
from app.database import init_db
from app.routers import bots, chat, jobs


@asynccontextmanager
async def lifespan(app: FastAPI):
    Path("./data").mkdir(exist_ok=True)
    Path(settings.chroma_persist_dir).mkdir(parents=True, exist_ok=True)
    await init_db()
    yield


app = FastAPI(
    title=settings.app_title,
    version=settings.app_version,
    lifespan=lifespan,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(bots.router)
app.include_router(chat.router)
app.include_router(jobs.router)


def _patch_file_fields(obj: Any) -> Any:
    """
    Pydantic v2 emits {"type": "string", "contentMediaType": "application/octet-stream"}
    for UploadFile, but Swagger UI only shows a file-picker for {"type": "string", "format": "binary"}.
    Walk the schema recursively and replace the former with the latter.

    Also flatten anyOf: [array, null] → array + nullable: true  (OpenAPI 3.0 style)
    so the file-picker is not hidden inside a oneOf selector widget.
    """
    if isinstance(obj, list):
        return [_patch_file_fields(i) for i in obj]

    if not isinstance(obj, dict):
        return obj

    # Replace contentMediaType with format: binary on leaf nodes
    if obj.get("type") == "string" and "contentMediaType" in obj:
        return {"type": "string", "format": "binary"}

    # Flatten anyOf: [{type: array, items: file}, {type: null}]
    if "anyOf" in obj and isinstance(obj["anyOf"], list):
        non_null = [s for s in obj["anyOf"] if s != {"type": "null"} and s.get("type") != "null"]
        has_null = len(non_null) < len(obj["anyOf"])
        if len(non_null) == 1:
            merged = {k: v for k, v in obj.items() if k != "anyOf"}
            merged.update(_patch_file_fields(non_null[0]))
            if has_null:
                merged["nullable"] = True
            return merged

    result = {k: _patch_file_fields(v) for k, v in obj.items()}

    # FastAPI + Pydantic v2 sometimes marks Optional[List[UploadFile]] fields as
    # required even when default=None; Swagger UI then refuses submission without a
    # file.  Strip nullable file-upload array fields from the required[] list.
    if "required" in result and "properties" in result:
        props = result["properties"]

        def _is_optional_file_array(name: str) -> bool:
            s = props.get(name, {})
            return (
                s.get("nullable")
                and s.get("type") == "array"
                and s.get("items", {}).get("format") == "binary"
            )

        required = [n for n in result["required"] if not _is_optional_file_array(n)]
        if required:
            result["required"] = required
        else:
            del result["required"]

    return result


def custom_openapi():
    if app.openapi_schema:
        return app.openapi_schema
    schema = get_openapi(
        title=settings.app_title,
        version=settings.app_version,
        openapi_version="3.0.2",
        routes=app.routes,
    )
    app.openapi_schema = _patch_file_fields(schema)
    return app.openapi_schema


app.openapi = custom_openapi


@app.get("/health", tags=["meta"])
async def health():
    return {"status": "ok", "version": settings.app_version}
