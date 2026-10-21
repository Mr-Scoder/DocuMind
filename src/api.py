
from pathlib import Path
from uuid import uuid4

from fastapi import FastAPI, File, HTTPException, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel

from src.ingest import ingest_pdf
from src.search import answer_question

app = FastAPI(title="Nitris Jr.")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173"],
    allow_methods=["GET", "POST"],
    allow_headers=["Content-Type"],
)

UPLOAD_DIR = Path("data/uploads")
MAX_FILE_SIZE = 10 * 1024 * 1024


class ChatRequest(BaseModel):
    question: str


@app.get("/api/health")
def health():
    return {"status": "ok"}


@app.post("/api/documents/upload")
async def upload_pdf(file: UploadFile = File(...)):
    if not file.filename or not file.filename.lower().endswith(".pdf"):
        raise HTTPException(400, "Please upload a PDF.")

    UPLOAD_DIR.mkdir(parents=True, exist_ok=True)

    document_id = str(uuid4())
    file_path = UPLOAD_DIR / f"{document_id}.pdf"
    size = 0

    try:
        # Stream to disk and enforce the size limit.
        with file_path.open("wb") as output:
            while True:
                chunk = await file.read(1024 * 1024)

                if not chunk:
                    break

                size += len(chunk)

                if size > MAX_FILE_SIZE:
                    raise HTTPException(
                        413, "PDF must be 10 MB or smaller."
                    )

                output.write(chunk)

        # Let PyMuPDF validate and parse the actual file.
        stats = ingest_pdf(
            file_path,
            source_name=Path(file.filename).name,
            document_id=document_id,
        )

        return {
            "document_id": document_id,
            "filename": Path(file.filename).name,
            "status": "indexed",
            "pages_extracted": stats["pages_extracted"],
            "chunks_indexed": stats["chunks_indexed"],
        }

    except HTTPException:
        raise
    except Exception as exc:
        raise HTTPException(
            500, "PDF processing failed. Check the server logs."
        ) from exc
    finally:
        await file.close()
        file_path.unlink(missing_ok=True)


@app.post("/api/chat")
def chat(request: ChatRequest):
    if not request.question.strip():
        raise HTTPException(400, "Question cannot be empty.")

    try:
        return answer_question(request.question)
    except Exception as exc:
        # Log the exception on the server in a production implementation.
        raise HTTPException(
            503, "Unable to generate an answer. Check model availability."
        ) from exc
