"""FastAPI entry point. Per-chat storage with SSE streaming."""

import base64
import json
import queue
import threading
from pathlib import Path

from fastapi import FastAPI, HTTPException, Query
from fastapi.responses import StreamingResponse
from pydantic import BaseModel

from src.config import get_logger
from src.llm import stream_followup, stream_summary, upload_fir_file
from src.models import SSEvent, SSEventType
from src.scraper import scrape_case_data_interactive

logger = get_logger(__name__)

app = FastAPI(title="Case History API")

# Per-chat data lives in backend/data/{chat_id}/
_DATA_DIR = Path(__file__).parent / "data"

# Per-chat queues for manual input (only live during /case-summary)
_input_queues: dict[str, queue.Queue] = {}


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


def _sse_line(event: SSEvent) -> str:
    """Format a single SSE ``data:`` frame."""
    return f"data: {event.model_dump_json()}\n\n"


# ── Case summary (interactive SSE) ──────────────────────────────────────────

@app.get("/case-summary")
def case_summary(
    cnr_num: str = Query(...),
    chat_id: str = Query(...),
):
    """Scrape case data with interactive SSE progress, then stream LLM summary."""
    event_q: queue.Queue[SSEvent | None] = queue.Queue()
    input_q: queue.Queue[dict] = queue.Queue()
    _input_queues[chat_id] = input_q

    def _run():
        try:
            data = scrape_case_data_interactive(cnr_num, event_q, input_q)

            # Save overview PNG
            chat = _chat_dir(chat_id)
            (chat / "case_overview.png").write_bytes(
                base64.b64decode(data["overview_img_b64"])
            )

            # Upload FIR directly from URL to OpenAI (may be None)
            fir_url = data["fir_file_url"]
            file_id = upload_fir_file(fir_url)
            if file_id is None:
                event_q.put(SSEvent(type=SSEventType.SUMMARY_LOG, content="FIR not available — generating summary without it"))

            # Initialise conv_history
            conv = {
                "cnr_num": cnr_num,
                "fir_file_url": fir_url,
                "summary": "",
                "messages": [],
            }
            _save_conv(chat_id, conv)

            # Stream LLM summary
            event_q.put(SSEvent(type=SSEventType.SUMMARY_LOG, content="Generating case summary"))

            full_text = ""
            for chunk in stream_summary(
                overview_img_b64=data["overview_img_b64"],
                history=data["history"],
                file_id=file_id,
            ):
                full_text += chunk
                event_q.put(SSEvent(type=SSEventType.TEXT_CHUNK, content=chunk))

            conv["summary"] = full_text
            _save_conv(chat_id, conv)
        except Exception as e:
            logger.exception("case-summary pipeline failed for CNR %s", cnr_num)
            event_q.put(SSEvent(type=SSEventType.SUMMARY_LOG, content=f"Error: {e}"))
        finally:
            event_q.put(None)  # sentinel

    threading.Thread(target=_run, daemon=True).start()

    def _generate():
        try:
            while True:
                event = event_q.get()
                if event is None:
                    break
                yield _sse_line(event)
        finally:
            _input_queues.pop(chat_id, None)

    return StreamingResponse(_generate(), media_type="text/event-stream")


# ── Manual input (captcha / district+PS) ─────────────────────────────────────

class ManualInput(BaseModel):
    captcha_text: str | None = None
    district: str | None = None
    ps: str | None = None


@app.post("/manual-input/{chat_id}")
def manual_input(chat_id: str, body: ManualInput):
    """Push user-provided data into the scraper thread."""
    iq = _input_queues.get(chat_id)
    if not iq:
        raise HTTPException(status_code=404, detail="No active session for this chat")
    iq.put(body.model_dump(exclude_none=True))
    return {"ok": True}


# ── Follow-up chat (SSE) ────────────────────────────────────────────────────

class ChatRequest(BaseModel):
    chat_id: str
    question: str


@app.post("/chat")
def chat(req: ChatRequest):
    """Load per-chat context from disk, stream a follow-up answer as SSE TEXT_CHUNKs."""
    conv = _load_conv(req.chat_id)
    if not conv or not conv.get("summary"):
        raise HTTPException(
            status_code=400,
            detail="No summary found for this chat. Generate the summary first.",
        )

    overview_b64 = _overview_b64(req.chat_id)
    file_id = upload_fir_file(conv.get("fir_file_url"))

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
            yield _sse_line(SSEvent(type=SSEventType.TEXT_CHUNK, content=chunk))
        conv["messages"].append({"role": "assistant", "content": full_text})
        _save_conv(req.chat_id, conv)

    return StreamingResponse(_stream_and_save(), media_type="text/event-stream")


# ── Static data ──────────────────────────────────────────────────────────────

@app.get("/all-ps")
def get_all_ps():
    """Return the district → police-station mapping for the frontend dropdown."""
    ps_file = _DATA_DIR / "all_ps.json"
    if not ps_file.exists():
        raise HTTPException(status_code=404, detail="all_ps.json not found")
    return json.loads(ps_file.read_text(encoding="utf-8"))
