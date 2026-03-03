"""FastAPI entry point. Per-chat storage with streaming LLM responses."""

import base64
import json
from pathlib import Path

from fastapi import FastAPI, HTTPException, Query
from fastapi.responses import StreamingResponse
from pydantic import BaseModel

from src.config import get_logger
from src.llm import stream_followup, stream_summary, upload_fir_file
from src.scraper import scrape_case_data

logger = get_logger(__name__)

app = FastAPI(title="Case History API")

# Per-chat data lives in backend/data/{chat_id}/
_DATA_DIR = Path(__file__).parent / "data"


def _chat_dir(chat_id: str) -> Path:
    d = _DATA_DIR / chat_id
    d.mkdir(parents=True, exist_ok=True)
    return d


def _history_path(chat_id: str) -> Path:
    return _chat_dir(chat_id) / "conv_history.json"


def _save_conv(chat_id: str, data: dict) -> None:
    _history_path(chat_id).write_text(
        json.dumps(data, ensure_ascii=False), encoding="utf-8"
    )


def _load_conv(chat_id: str) -> dict | None:
    p = _history_path(chat_id)
    if not p.exists():
        return None
    return json.loads(p.read_text(encoding="utf-8"))


def _overview_b64(chat_id: str) -> str:
    """Read the locally saved overview PNG and return it as base64."""
    png_path = _chat_dir(chat_id) / "case_overview.png"
    return base64.b64encode(png_path.read_bytes()).decode("utf-8")


@app.get("/case-summary")
def case_summary(
    cnr_num: str = Query(...),
    chat_id: str = Query(...),
):
    """Scrape case data, save assets to disk, stream the LLM summary."""
    try:
        data = scrape_case_data(cnr_num)
    except Exception as e:
        logger.exception("Scraping failed for CNR %s", cnr_num)
        raise HTTPException(status_code=500, detail=f"Scraping failed: {e}")

    # Save overview PNG
    chat = _chat_dir(chat_id)
    (chat / "case_overview.png").write_bytes(
        base64.b64decode(data["overview_img_b64"])
    )

    # Upload FIR directly from URL to OpenAI
    file_id = upload_fir_file(data["fir_file_url"])

    # Initialise conv_history.json (summary will be appended when stream completes)
    conv = {
        "cnr_num": cnr_num,
        "fir_file_url": data["fir_file_url"],
        "summary": "",
        "messages": [],
    }
    _save_conv(chat_id, conv)

    def _stream_and_save():
        full_text = ""
        for chunk in stream_summary(
            overview_img_b64=data["overview_img_b64"],
            history=data["history"],
            file_id=file_id,
        ):
            full_text += chunk
            yield chunk
        # Stream done — persist the full summary
        conv["summary"] = full_text
        _save_conv(chat_id, conv)

    return StreamingResponse(_stream_and_save(), media_type="text/plain")


class ChatRequest(BaseModel):
    chat_id: str
    question: str


@app.post("/chat")
def chat(req: ChatRequest):
    """Load per-chat context from disk, stream a follow-up answer, save it."""
    conv = _load_conv(req.chat_id)
    if not conv or not conv.get("summary"):
        raise HTTPException(
            status_code=400,
            detail="No summary found for this chat. Generate the summary first.",
        )

    # Load overview image from local PNG
    overview_b64 = _overview_b64(req.chat_id)

    # Upload FIR PDF to OpenAI from URL
    file_id = upload_fir_file(conv["fir_file_url"])

    # Add the new user question to messages
    conv["messages"].append({"role": "user", "content": req.question})
    _save_conv(req.chat_id, conv)

    def _stream_and_save():
        full_text = ""
        for chunk in stream_followup(
            summary=conv["summary"],
            follow_up_messages=conv["messages"],
            overview_img_b64=overview_b64,
            file_id=file_id,
        ):
            full_text += chunk
            yield chunk
        # Stream done — persist the assistant response
        conv["messages"].append({"role": "assistant", "content": full_text})
        _save_conv(req.chat_id, conv)

    return StreamingResponse(_stream_and_save(), media_type="text/plain")
