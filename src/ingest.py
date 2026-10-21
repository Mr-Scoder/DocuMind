
from pathlib import Path
import pymupdf
import chromadb

from chromadb.utils.embedding_functions import (
    SentenceTransformerEmbeddingFunction,
)

DATA_DIR = Path("data/raw")
DB_DIR = Path("data/chroma_db")
COLLECTION_NAME = "pdf_documents"

client = chromadb.PersistentClient(path=str(DB_DIR))

embedding_function = SentenceTransformerEmbeddingFunction(
    model_name="all-MiniLM-L6-v2"
)

collection = client.get_or_create_collection(
    name=COLLECTION_NAME,
    embedding_function=embedding_function,
)


def extract_pdf(pdf_path: Path) -> list[dict]:
    pages = []

    with pymupdf.open(pdf_path) as pdf:
        for page_number, page in enumerate(pdf, start=1):
            text = page.get_text("text").strip()

            if text:
                pages.append({
                    "text": text,
                    "source": pdf_path.name,
                    "page": page_number,
                })

    return pages


def chunk_text(text: str, chunk_size: int = 500,
               overlap: int = 100) -> list[str]:
    if chunk_size <= 0:
        raise ValueError("chunk_size must be positive")

    if overlap < 0 or overlap >= chunk_size:
        raise ValueError("overlap must be >= 0 and < chunk_size")

    words = text.split()
    chunks = []
    start = 0

    while start < len(words):
        end = min(start + chunk_size, len(words))
        chunks.append(" ".join(words[start:end]))

        if end == len(words):
            break

        start = end - overlap

    return chunks


def ingest_pdf(
    pdf_path: str | Path,
    source_name: str | None = None,
    document_id: str | None = None,
) -> dict:
    """Index one PDF and return ingestion statistics."""

    pdf_path = Path(pdf_path)
    source_name = source_name or pdf_path.name
    document_id = document_id or source_name

    pages = extract_pdf(pdf_path)

    documents = []
    metadatas = []
    ids = []

    for page in pages:
        chunks = chunk_text(page["text"])

        for chunk_index, chunk in enumerate(chunks):
            chunk_id = (
                f"{document_id}:{page['page']}:{chunk_index}"
            )

            documents.append(chunk)
            metadatas.append({
                "source": source_name,
                "page": page["page"],
                "chunk_index": chunk_index,
                "document_id": document_id,
            })
            ids.append(chunk_id)

    if not documents:
        raise ValueError(
            "No extractable text found in this PDF."
        )

    # Replace old chunks belonging to this document.
    # Existing legacy chunks without document_id remain untouched.
    collection.delete(
        where={"document_id": document_id}
    )

    batch_size = 5000

    for start in range(0, len(documents), batch_size):
        end = start + batch_size

        collection.upsert(
            ids=ids[start:end],
            documents=documents[start:end],
            metadatas=metadatas[start:end],
        )

    return {
        "document_id": document_id,
        "filename": source_name,
        "pages_extracted": len(pages),
        "chunks_indexed": len(documents),
    }


def main():
    pdf_files = list(DATA_DIR.glob("*.pdf"))

    if not pdf_files:
        print("No PDFs found in data/raw")
        return

    for pdf_path in pdf_files:
        try:
            stats = ingest_pdf(pdf_path)
            print(stats)
        except Exception as exc:
            print(f"Failed to ingest {pdf_path.name}: {exc}")

    print(f"Chunks in collection: {collection.count()}")
    print(f"Database saved at: {DB_DIR}")


if __name__ == "__main__":
    main()
