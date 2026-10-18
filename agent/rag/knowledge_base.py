# -*- coding: utf-8 -*-
"""
RAG knowledge base: loads the markdown files under rag/knowledge/, chunks
them, embeds with the shared Embedder, and indexes them in FAISS.

Categories map 1:1 to the spec's four knowledge sub-bases:
  waste_classification.md -> 建筑垃圾知识库
  carbon_accounting.md    -> 碳核算知识库
  esg_sdg.md               -> ESG知识库
  policy.md                 -> 政策知识库

All categories share one embedding space (统一Embedding / 统一FAISS索引),
but we keep a per-chunk `category` tag so agents can filter (e.g. Policy
Agent only wants `policy` chunks) while Report Agent can search across all.
"""
import os
import re
import logging
from dataclasses import dataclass
from typing import List, Optional

import numpy as np

try:
    import faiss  # type: ignore
except ImportError:  # pragma: no cover
    faiss = None

from agent.rag.embeddings import Embedder, EMBED_DIM

logger = logging.getLogger("agent.rag.kb")

KNOWLEDGE_DIR = os.path.join(os.path.dirname(__file__), "knowledge")

CATEGORY_BY_FILE = {
    "waste_classification.md": "waste",
    "carbon_accounting.md": "carbon",
    "esg_sdg.md": "esg",
    "policy.md": "policy",
}


@dataclass
class Chunk:
    text: str
    category: str
    source: str


def _chunk_markdown(text: str, source: str, category: str, max_chars: int = 350) -> List[Chunk]:
    """Split on markdown headings first, then hard-wrap anything still too long."""
    sections = re.split(r"\n(?=#{1,3} )", text.strip())
    chunks: List[Chunk] = []
    for section in sections:
        section = section.strip()
        if not section:
            continue
        if len(section) <= max_chars:
            chunks.append(Chunk(text=section, category=category, source=source))
        else:
            for i in range(0, len(section), max_chars):
                chunks.append(Chunk(text=section[i:i + max_chars], category=category, source=source))
    return chunks


class _NumpyFallbackIndex:
    """Used when faiss isn't installed — brute-force cosine search over numpy."""

    def __init__(self, dim: int):
        self.dim = dim
        self.vectors: Optional[np.ndarray] = None

    def add(self, vecs: np.ndarray):
        self.vectors = vecs if self.vectors is None else np.vstack([self.vectors, vecs])

    def search(self, query: np.ndarray, k: int):
        if self.vectors is None or len(self.vectors) == 0:
            return np.array([[]]), np.array([[]])
        sims = self.vectors @ query[0]
        top_idx = np.argsort(-sims)[:k]
        return sims[top_idx][None, :], top_idx[None, :]


class KnowledgeBase:
    _instance = None

    def __init__(self):
        self.embedder = Embedder.instance()
        self.chunks: List[Chunk] = []
        self.index = faiss.IndexFlatIP(EMBED_DIM) if faiss is not None else _NumpyFallbackIndex(EMBED_DIM)
        self._build()

    @classmethod
    def instance(cls) -> "KnowledgeBase":
        if cls._instance is None:
            cls._instance = cls()
        return cls._instance

    def _build(self):
        if not os.path.isdir(KNOWLEDGE_DIR):
            logger.warning("Knowledge dir %s missing — RAG will return no results.", KNOWLEDGE_DIR)
            return
        for fname in sorted(os.listdir(KNOWLEDGE_DIR)):
            if not fname.endswith(".md"):
                continue
            category = CATEGORY_BY_FILE.get(fname, "general")
            with open(os.path.join(KNOWLEDGE_DIR, fname), "r", encoding="utf-8") as f:
                text = f.read()
            self.chunks.extend(_chunk_markdown(text, source=fname, category=category))

        if not self.chunks:
            return
        vectors = self.embedder.encode([c.text for c in self.chunks])
        self.index.add(vectors)
        logger.info(
            "KnowledgeBase built: %d chunks across %d files (embedder_fallback=%s)",
            len(self.chunks), len(CATEGORY_BY_FILE), self.embedder.is_fallback,
        )

    def search(self, query: str, k: int = 4, category: Optional[str] = None) -> List[Chunk]:
        if not self.chunks:
            return []
        qvec = self.embedder.encode([query])
        # over-fetch so we can still return k results after category filtering
        fetch_k = min(len(self.chunks), max(k * 4, k))
        _, idxs = self.index.search(qvec, fetch_k)
        results = []
        for idx in idxs[0]:
            if idx < 0 or idx >= len(self.chunks):
                continue
            chunk = self.chunks[idx]
            if category and chunk.category != category:
                continue
            results.append(chunk)
            if len(results) >= k:
                break
        return results
