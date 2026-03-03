"""FastAPI entry point. Stream a case summary over HTTP."""

from fastapi import FastAPI, HTTPException, Query
from fastapi.responses import StreamingResponse
from pydantic import BaseModel

from src.config import get_logger
from src.llm import stream_followup, stream_summary, upload_fir_file
from src.scraper import scrape_case_data

logger = get_logger(__name__)

app = FastAPI(title="Case History API")

# In-memory cache: cnr_num -> {overview_img_b64, history, fir_file_url, file_id}
_case_cache: dict[str, dict] = {}


@app.get("/case-summary")
def case_summary(cnr_num: str = Query(..., description="CNR number of the case")):
    """Scrape, upload FIR, cache context, then stream an LLM summary."""
    try:
        data = scrape_case_data(cnr_num)
    except Exception as e:
        logger.exception("Scraping failed for CNR %s", cnr_num)
        raise HTTPException(status_code=500, detail=f"Scraping failed: {e}")

    try:
        file_id = upload_fir_file(data["fir_file_url"])
    except Exception as e:
        logger.exception("FIR upload failed for CNR %s", cnr_num)
        raise HTTPException(status_code=500, detail=f"FIR upload failed: {e}")

    _case_cache[cnr_num] = {
        "overview_img_b64": data["overview_img_b64"],
        "history": data["history"],
        "fir_file_url": data["fir_file_url"],
        "file_id": file_id,
    }

    return StreamingResponse(
        stream_summary(
            overview_img_b64=data["overview_img_b64"],
            history=data["history"],
            file_id=file_id,
        ),
        media_type="text/plain",
    )


class ChatRequest(BaseModel):
    cnr_num: str
    conversation_history: list[dict]


@app.post("/chat")
def chat(req: ChatRequest):
    """Stream a follow-up answer using cached case context + conversation history."""
    cache = _case_cache.get(req.cnr_num)
    if not cache:
        raise HTTPException(
            status_code=400,
            detail="Case context not cached. Generate the summary first.",
        )

    return StreamingResponse(
        stream_followup(
            conversation_history=req.conversation_history,
            overview_img_b64=cache["overview_img_b64"],
            history=cache["history"],
            file_id=cache["file_id"],
        ),
        media_type="text/plain",
    )
