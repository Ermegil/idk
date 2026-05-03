import chromadb
from config import CHROMA_DIR

client = chromadb.PersistentClient(path=CHROMA_DIR)

collection = client.get_or_create_collection(
    name="rag_notes"
)