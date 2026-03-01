import base64
import logging
import re
from typing import Generator

import requests
from fastapi import FastAPI, Query, HTTPException
from fastapi.responses import StreamingResponse

from main import (
    Browser,
    CASE_URL,
    FIR_URL,
    SUMMARY_PROMPT_FILE,
    client,
    enter_CNR_and_solve_captcha,
    html_table_to_rows,
    get_FIR_details,
    ask_llm_options,
    build_summary_text,
    load_prompt_file,
)

logger = logging.getLogger(__name__)

app = FastAPI(title="Case History API")


def scrape_case_data(cnr_num: str) -> dict:
    """Run full browser automation to collect case data, history, and FIR PDF URL."""
    logger.info("Starting scrape for CNR: %s", cnr_num)
    b = Browser().start()
    page = b.page
    try:
        # Open eCourts and enter CNR + solve captcha with retries
        page.goto(CASE_URL, wait_until="domcontentloaded")
        page.wait_for_timeout(1000)
        enter_CNR_and_solve_captcha(page=page, CNR=cnr_num)

        # Inject table border CSS for clean screenshot
        page.add_style_tag(
            content="""
            table, th, td {
                border: 1px solid black !important;
                border-collapse: collapse !important;
            }
            div { padding: 10px; }
            """
        )

        # Overview screenshot
        overview_img_bytes = page.locator("#history_cnr").screenshot()
        overview_img_b64 = base64.b64encode(overview_img_bytes).decode("utf-8")

        # FIR details
        FIR_table_html = page.locator("table.FIR_details_table").inner_html()
        FIR_rows = html_table_to_rows(table_html=FIR_table_html)
        police_stn, FIR_num, FIR_year = get_FIR_details(FIR_rows=FIR_rows)

        # Case history
        history_table_html = page.locator("table.history_table").inner_html()
        history_rows = html_table_to_rows(table_html=history_table_html)[1:]

        history = []
        for i, row in enumerate(history_rows):
            judge, info, hearing_date, purpose = row
            onclick = info["onclick"]
            business_on_date = onclick.split(",")[6]

            page.evaluate(onclick)
            page.wait_for_load_state("domcontentloaded")
            page.wait_for_timeout(500)

            content = page.locator("#mydiv").inner_text()
            content = re.sub(r"\t+", "\t", content)

            history.append(
                {
                    "judge": judge,
                    "business_on_date": business_on_date,
                    "hearing_date": hearing_date,
                    "purpose": purpose,
                    "content": content,
                    "row_num": f"{i+1} (Row number of entry on 'Case History' table. Refer to case overview image given to you. 1-indexed)",
                }
            )

            page.click("#caseBusinessDiv_back")
            page.wait_for_load_state("domcontentloaded")

        # FIR document lookup
        page.goto(FIR_URL, wait_until="domcontentloaded")

        district_options = page.eval_on_selector(
            "#district_id",
            'select => Array.from(select.options).slice(1).map(o => o.textContent.trim()).join(",")',
        )
        district = ask_llm_options(
            options=district_options,
            ps=police_stn,
            prompt="Help me choose my district using my police station given to you **STRICTLY** from the options given to you",
        )
        page.select_option("#district_id", label=district)

        page.wait_for_function(
            "() => document.querySelector('#ps_id').options.length > 1"
        )
        ps_options = page.eval_on_selector(
            "#ps_id",
            'select => Array.from(select.options).slice(1).map(o => o.textContent.trim()).join(",")',
        )
        ps = ask_llm_options(
            options=ps_options,
            ps=police_stn,
            prompt="Help me choose the correct spelling of my police station **STRICTLY** from the options given yo",
        )
        page.select_option("#ps_id", label=ps)

        page.type("#fir_num", FIR_num)
        captcha_text = page.locator("div.captcha").inner_text()
        page.type("#captcha", captcha_text)
        page.select_option("#year", label=FIR_year)

        with page.expect_popup() as popup_info:
            page.click("input.btn.btn-primary.btn-lg.pull-right.btnfir")
        new_page = popup_info.value
        new_page.wait_for_load_state()

        with new_page.expect_popup() as popup_info:
            new_page.click("a.btn")
        final_page = popup_info.value
        final_page.wait_for_load_state()

        fir_file_url = final_page.url
        logger.info("Scrape complete. FIR PDF URL: %s", fir_file_url)

        return {
            "overview_img_b64": overview_img_b64,
            "history": history,
            "fir_file_url": fir_file_url,
        }
    finally:
        b.stop()


def stream_summary(
    overview_img_b64: str, history: list[dict], fir_file_url: str
) -> Generator[str, None, None]:
    """Yield LLM summary chunks as they arrive."""
    pdf_bytes = requests.get(fir_file_url).content

    file = client.files.create(
        file=("fir.pdf", pdf_bytes, "application/pdf"), purpose="user_data"
    )

    input_items: list = [
        {"role": "system", "content": load_prompt_file(SUMMARY_PROMPT_FILE)},
        {
            "role": "user",
            "content": [
                {"type": "input_text", "text": build_summary_text(history=history)},
                {
                    "type": "input_image",
                    "image_url": f"data:image/png;base64,{overview_img_b64}",
                    "detail": "high",
                },
                {"type": "input_file", "file_id": file.id},
            ],
        },
    ]

    stream = client.responses.create(
        model="gpt-5-nano",
        input=input_items,
        reasoning={"effort": "low"},
        stream=True,
    )

    for event in stream:
        if event.type == "response.output_text.delta":
            yield event.delta


@app.get("/case-summary")
def case_summary(cnr_num: str = Query(..., description="CNR number of the case")):
    """Stream an LLM-generated summary for the given CNR case number."""
    try:
        data = scrape_case_data(cnr_num)
    except Exception as e:
        logger.exception("Scraping failed for CNR %s", cnr_num)
        raise HTTPException(status_code=500, detail=f"Scraping failed: {e}")

    return StreamingResponse(
        stream_summary(
            data["overview_img_b64"],
            data["history"],
            data["fir_file_url"],
        ),
        media_type="text/plain",
    )
