"""FastAPI entry point. Stream a case summary over HTTP."""

from fastapi import FastAPI, HTTPException, Query
from fastapi.responses import StreamingResponse

from src.config import get_logger
from src.llm import stream_summary
from src.scraper import scrape_case_data

logger = get_logger(__name__)

app = FastAPI(title="Case History API")


@app.get("/case-summary")
def case_summary(cnr_num: str = Query(..., description="CNR number of the case")):
    """Stream an LLM generated summary for the given CNR case number."""
    try:
        data = scrape_case_data(cnr_num)
    except Exception as e:
        logger.exception("Scraping failed for CNR %s", cnr_num)
        raise HTTPException(status_code=500, detail=f"Scraping failed: {e}")

    return StreamingResponse(
        stream_summary(
            overview_img_b64=data["overview_img_b64"],
            history=data["history"],
            fir_file_url=data["fir_file_url"],
        ),
        media_type="text/plain",
    )
