# -*- coding: utf-8 -*-
"""
Persistent long-term memory (spec: "memory_store" table + RAG recall of
past consultations/projects/reports). This is separate from LangGraph's
in-run CarbonState — CarbonState is per-run working memory; memory_store
is what lets a *later* run recall an *earlier* one for the same user
asking about the same project again.

Reuses backend/carbon.db (same SQLite file the Flask app already uses),
so the whole platform stays on one database as the spec requires — this
service only ADDS a table, it never touches the existing schema.
"""
import os
import json
import sqlite3
import time
import logging
from typing import List, Optional
from dataclasses import dataclass

import numpy as np

from agent.rag.embeddings import Embedder

logger = logging.getLogger("agent.memory")

DEFAULT_DB_PATH = os.environ.get(
    "CARBON_DB_PATH",
    os.path.join(os.path.dirname(__file__), "..", "..", "backend", "carbon.db"),
)


def _connect(db_path: str = DEFAULT_DB_PATH) -> sqlite3.Connection:
    conn = sqlite3.connect(db_path)
    conn.row_factory = sqlite3.Row
    return conn


def ensure_schema(db_path: str = DEFAULT_DB_PATH):
    """Idempotent — safe to call on every service start, mirrors init_db()'s
    'CREATE TABLE IF NOT EXISTS' style in the Flask backend."""
    conn = _connect(db_path)
    conn.executescript(
        """
        CREATE TABLE IF NOT EXISTS memory_store (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            session_id TEXT,
            content TEXT,
            embedding BLOB,
            kind TEXT DEFAULT 'chat',
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP
        );
        CREATE INDEX IF NOT EXISTS idx_memory_session ON memory_store(session_id);
        """
    )
    conn.commit()
    conn.close()


@dataclass
class MemoryRecord:
    id: int
    session_id: str
    content: str
    kind: str
    created_at: str


class MemoryStore:
    def __init__(self, db_path: str = DEFAULT_DB_PATH):
        self.db_path = db_path
        ensure_schema(db_path)
        self.embedder = Embedder.instance()

    def write(self, session_id: str, content: str, kind: str = "chat"):
        vec = self.embedder.encode([content])[0].astype("float32")
        conn = _connect(self.db_path)
        conn.execute(
            "INSERT INTO memory_store (session_id, content, embedding, kind, created_at) VALUES (?,?,?,?,?)",
            (session_id, content, vec.tobytes(), kind, int(time.time())),
        )
        conn.commit()
        conn.close()

    def history(self, session_id: str, limit: int = 50) -> List[MemoryRecord]:
        conn = _connect(self.db_path)
        rows = conn.execute(
            "SELECT id, session_id, content, kind, created_at FROM memory_store "
            "WHERE session_id=? ORDER BY id DESC LIMIT ?",
            (session_id, limit),
        ).fetchall()
        conn.close()
        return [MemoryRecord(**dict(r)) for r in rows][::-1]

    def recall(self, query: str, session_id: Optional[str] = None, k: int = 3) -> List[MemoryRecord]:
        """Semantic recall across (optionally scoped to one session's) past
        entries — this is what lets the system say 'you asked about this
        project before, here's what we found then'."""
        conn = _connect(self.db_path)
        if session_id:
            rows = conn.execute(
                "SELECT id, session_id, content, embedding, kind, created_at FROM memory_store WHERE session_id=?",
                (session_id,),
            ).fetchall()
        else:
            rows = conn.execute(
                "SELECT id, session_id, content, embedding, kind, created_at FROM memory_store"
            ).fetchall()
        conn.close()
        if not rows:
            return []

        qvec = self.embedder.encode([query])[0]
        scored = []
        for r in rows:
            vec = np.frombuffer(r["embedding"], dtype="float32")
            sim = float(np.dot(qvec, vec))
            scored.append((sim, r))
        scored.sort(key=lambda x: x[0], reverse=True)
        top = scored[:k]
        return [
            MemoryRecord(id=r["id"], session_id=r["session_id"], content=r["content"],
                         kind=r["kind"], created_at=r["created_at"])
            for _, r in top
        ]
