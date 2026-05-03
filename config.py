# config.py

# --- Paths ---
OBS_DIR = r"F:\RAG\obsidian"   # поменяй под себя
CHROMA_DIR = r"F:\RAG\chroma_db"

# --- Embeddings (LM Studio / Ollama OpenAI-compatible) ---
EMBED_URL = "http://localhost:1234/v1/embeddings"
EMBED_MODEL = "text-embedding-nomic-embed-text-v1.5"

# --- LLM (LM Studio chat endpoint) ---
LLM_URL = "http://localhost:1234/v1/chat/completions"
LLM_MODEL = "qwen/qwen3.5-9b"

# --- Chunking ---
CHUNK_SIZE = 800
CHUNK_OVERLAP = 150