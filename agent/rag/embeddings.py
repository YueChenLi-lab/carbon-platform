# -*- coding: utf-8 -*-
"""
Embedding backend used by both the knowledge-base RAG index and the
long-term memory_store recall.

Primary path: `bge-large-zh` (or BCE Embedding) via sentence-transformers.
Fallback path: a deterministic hashing vectorizer, used automatically when
sentence-transformers / the model weights aren't available (e.g. this
sandbox has no network access to download them). The fallback keeps the
whole pipeline runnable end-to-end for demo/dev purposes; swap in the real
model in production by installing sentence-transformers and the weights —
no other code changes needed, since everything else talks to `Embedder`.
"""
import hashlib
import logging
import numpy as np

logger = logging.getLogger("agent.rag.embeddings")

EMBED_DIM = 1024  # matches bge-large-zh's native dimension


class _HashingFallbackEmbedder:
    """
    Deterministic, dependency-free bag-of-character-ngrams hashing embedder.
    Not semantically strong, but stable, offline, and good enough to keep
    FAISS similarity search functioning during development.
    """

    def __init__(self, dim: int = EMBED_DIM):
        self.dim = dim

    def _vector(self, text: str) -> np.ndarray:
        vec = np.zeros(self.dim, dtype="float32")
        text = (text or "").strip()
        if not text:
            return vec
        for n in (2, 3):
            for i in range(len(text) - n + 1):
                gram = text[i:i + n]
                h = int(hashlib.md5(gram.encode("utf-8")).hexdigest(), 16)
                vec[h % self.dim] += 1.0
        norm = np.linalg.norm(vec)
        if norm > 0:
            vec /= norm
        return vec

    def encode(self, texts, **kwargs):
        if isinstance(texts, str):
            texts = [texts]
        return np.stack([self._vector(t) for t in texts])


class Embedder:
    _instance = None

    def __init__(self, model_name: str = "BAAI/bge-large-zh"):
        self.model_name = model_name
        self._model = None
        self._is_fallback = False
        try:
            from sentence_transformers import SentenceTransformer  # noqa: WPS433
            self._model = SentenceTransformer(model_name)
            logger.info("Loaded embedding model %s", model_name)
        except Exception as e:  # noqa: BLE001
            logger.warning(
                "Could not load %s (%s) — falling back to offline hashing embedder. "
                "Install sentence-transformers and pull the model weights for production use.",
                model_name, e,
            )
            self._model = _HashingFallbackEmbedder()
            self._is_fallback = True

    @classmethod
    def instance(cls) -> "Embedder":
        if cls._instance is None:
            cls._instance = cls()
        return cls._instance

    @property
    def is_fallback(self) -> bool:
        return self._is_fallback

    def encode(self, texts):
        vectors = self._model.encode(texts, normalize_embeddings=not self._is_fallback)
        return np.asarray(vectors, dtype="float32")
