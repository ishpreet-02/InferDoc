"""Moss retrieval sidecar.

A thin FastAPI service that hosts the (Python-only) `inferedge-moss` SDK and
exposes two endpoints the Next.js app calls over HTTP:

    POST /index/{product_id}   -> upsert chunks into Moss index "product-{id}"
    POST /query/{product_id}   -> semantic/hybrid search over that index

Convention (see CLAUDE.md): one Moss index per product, named `product-{productId}`.

Run from backend/:  uv run uvicorn main:app --reload --port 8000
"""

import os
from typing import Any

from dotenv import load_dotenv
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel

from inferedge_moss import MossClient, DocumentInfo, QueryOptions

load_dotenv()

PROJECT_ID = os.environ.get("MOSS_PROJECT_ID")
PROJECT_KEY = os.environ.get("MOSS_PROJECT_KEY")

# Single shared index for the whole catalog. The Moss free tier caps the number
# of indexes (3), so instead of one-index-per-product we keep all chunks in one
# index and tag each with `productId` in metadata, filtering at query time.
INDEX_NAME = os.environ.get("MOSS_INDEX", "acme-catalog")

# Build the client lazily so the service still boots (and /health reports the
# misconfiguration) when creds are missing, rather than crashing on import.
_client: MossClient | None = None

# Track which indexes are already loaded in this process. load_index() is slow
# (~2s) and was previously called on every query — once per process is enough,
# so we skip it after the first successful load (or after an index write).
_loaded: set[str] = set()


def client() -> MossClient:
    global _client
    if not PROJECT_ID or not PROJECT_KEY:
        raise HTTPException(
            status_code=503,
            detail="MOSS_PROJECT_ID / MOSS_PROJECT_KEY are not set in backend/.env",
        )
    if _client is None:
        _client = MossClient(PROJECT_ID, PROJECT_KEY)
    return _client


# ---- request/response models -------------------------------------------------


class DocIn(BaseModel):
    id: str
    text: str
    metadata: dict[str, Any] = {}


class IndexBody(BaseModel):
    docs: list[DocIn]


class QueryBody(BaseModel):
    query: str
    top_k: int = 5
    alpha: float = 0.8  # 0=keyword-only, 1=semantic-only, 0.8=hybrid default


# ---- app ---------------------------------------------------------------------

app = FastAPI(title="Moss retrieval sidecar")

# Next.js calls us server-side, but allow CORS so the endpoints are also
# reachable from the browser during debugging.
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.get("/health")
async def health():
    return {
        "ok": True,
        "moss_configured": bool(PROJECT_ID and PROJECT_KEY),
        "index": INDEX_NAME,
    }


@app.post("/index/{product_id}")
async def index(product_id: str, body: IndexBody):
    """Upsert the given chunks into the shared catalog index.

    Each chunk is tagged with its `productId` so queries can filter to one
    product. We try create_index first (first ever call) and fall back to
    add_docs once the index exists; then load it so it is query-ready.
    """
    # Moss requires metadata values to be strings; coerce (e.g. the int page)
    # and inject the productId so we can filter on it at query time.
    docs = [
        DocumentInfo(
            id=d.id,
            text=d.text,
            metadata={
                **{k: str(v) for k, v in (d.metadata or {}).items()},
                "productId": product_id,
            },
        )
        for d in body.docs
    ]
    if not docs:
        raise HTTPException(status_code=400, detail="no docs to index")

    c = client()
    try:
        await c.create_index(INDEX_NAME, docs)
    except Exception:
        # Index already exists — append/upsert instead.
        await c.add_docs(INDEX_NAME, docs)

    # The index changed; reload it now and mark it ready so queries skip reload.
    await c.load_index(INDEX_NAME)
    _loaded.add(INDEX_NAME)
    return {"ok": True, "index": INDEX_NAME, "productId": product_id, "indexed": len(docs)}


@app.post("/query/{product_id}")
async def query(product_id: str, body: QueryBody):
    """Search the shared index, filtered to a single product's chunks."""
    c = client()

    # Only load the index the first time we see it this process; load_index is
    # slow and the index rarely changes between queries.
    if INDEX_NAME not in _loaded:
        try:
            await c.load_index(INDEX_NAME)
            _loaded.add(INDEX_NAME)
        except Exception as e:
            raise HTTPException(
                status_code=404,
                detail=f"index {INDEX_NAME} not found / not loadable: {e}",
            )

    result = await c.query(
        INDEX_NAME,
        body.query,
        QueryOptions(
            top_k=body.top_k,
            alpha=body.alpha,
            filter={
                "$and": [
                    {"field": "productId", "condition": {"$eq": product_id}}
                ]
            },
        ),
    )

    docs = [
        {
            "id": d.id,
            "text": d.text,
            "score": getattr(d, "score", None),
            "metadata": getattr(d, "metadata", {}) or {},
        }
        for d in result.docs
    ]
    return {
        "ok": True,
        "index": INDEX_NAME,
        "productId": product_id,
        "query": body.query,
        "docs": docs,
    }
