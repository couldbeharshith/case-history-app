"""Web scraping orchestration: HTML parsing, captcha flow, full case data extraction."""

from __future__ import annotations

import base64
import queue
import re

from bs4 import BeautifulSoup
from playwright.sync_api import Page

from src.browser import Browser
from src.config import CASE_URL, FIR_URL, MAX_CAPTCHA_RETRIES, get_logger
from src.llm import ask_llm_options, solve_captcha
from src.district import get_district_and_ps
from src.models import SSEvent, SSEventType


logger = get_logger(__name__)

_TABLE_BORDER_CSS = """
table, th, td {
    border: 1px solid black !important;
    border-collapse: collapse !important;
}
div { padding: 10px; }
"""


def html_table_to_rows(table_html: str) -> list[list]:
    """Parse an HTML table fragment into a list of rows (list of cell values).

    Cells containing `<a>` tags are returned as dicts with *text*, *onclick*, and *aria_label* keys.
    """
    soup = BeautifulSoup(table_html, "html.parser")
    rows: list[list] = []
    for tr in soup.select("tr"):
        cells: list = []
        for cell in tr.select("th, td"):
            link = cell.find("a")
            if link:
                cells.append(
                    {
                        "text": link.get_text(strip=True),
                        "onclick": link.get("onclick"),
                        "aria_label": link.get("aria-label"),
                    }
                )
            else:
                cells.append(cell.get_text(strip=True))
        if cells:
            rows.append(cells)
    return rows


def get_fir_details(fir_rows: list[list]) -> tuple[str, str, str]:
    """Extract (police_station, padded_fir_number, year) from FIR table rows."""
    stn_row, num_row, year_row = fir_rows[-3:]
    police_stn = stn_row[1].strip()
    num = num_row[1].strip().zfill(4)
    year = year_row[1].strip()
    return police_stn, num, year


# ── Captcha + CNR entry ──────────────────────────────────────────────────────
def enter_cnr_and_solve_captcha(page: Page, cnr: str) -> None:
    """Type the CNR, solve the captcha image, and retry up to *MAX_CAPTCHA_RETRIES*."""
    for attempt in range(1, MAX_CAPTCHA_RETRIES + 1):
        page.locator("#cino").type(cnr, delay=70)
        page.wait_for_selector("#captcha_image", state="visible")

        img_bytes = page.locator("#captcha_image").screenshot()
        b64 = base64.b64encode(img_bytes).decode("utf-8")

        captcha = solve_captcha(b64)
        page.locator("#fcaptcha_code").type(captcha, delay=40)
        page.wait_for_timeout(50)
        page.click("#searchbtn")
        page.wait_for_timeout(500)
        
        # wait till loading finishes (max 5s)
        if page.locator("div.loader-txt").is_visible():
            page.wait_for_selector("div.loader-txt", state="hidden", timeout=5000)

        if not page.locator("div.modal-body.p-1").is_visible():
            logger.info("Captcha solved on attempt %d", attempt)
            return

        logger.warning("Captcha wrong (attempt %d/%d)", attempt, MAX_CAPTCHA_RETRIES)
        if attempt < MAX_CAPTCHA_RETRIES:
            page.reload()

    raise RuntimeError(f"Failed to solve captcha after {MAX_CAPTCHA_RETRIES} attempts")


# ── Case history extraction ──────────────────────────────────────────────────
def _extract_history(page: Page) -> list[dict[str, str]]:
    """Click through each history row and collect structured data."""
    table_html = page.locator("table.history_table").inner_html()
    rows = html_table_to_rows(table_html)[1:]  # skip header

    history: list[dict[str, str]] = []
    for idx, row in enumerate(rows):
        judge, info, hearing_date, purpose = row
        onclick: str = info["onclick"]
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
                "row_num": (
                    f"{idx + 1} (Row number of entry on 'Case History' table."
                    " Refer to case overview image given to you. 1-indexed)"
                ),
            }
        )

        page.click("#caseBusinessDiv_back")
        page.wait_for_load_state("domcontentloaded")

    logger.info("Extracted %d history entries", len(history))
    return history


# ── FIR PDF lookup ───────────────────────────────────────────────────────────
def _lookup_fir_pdf_url(
    page: Page,
    police_stn: str,
    fir_num: str,
    fir_year: str,
) -> str:
    """Navigate the KSP FIR-search portal and return the direct PDF URL."""
    page.goto(FIR_URL, wait_until="domcontentloaded")

    # Select district
    district_options = page.eval_on_selector(
        "#district_id",
        'el => Array.from(el.options).slice(1).map(o => o.textContent.trim()).join(",")',
    )
    
    #NOTE: LLM is expensive, try exact match 
    # district = ask_llm_options(
    #     options=district_options,
    #     ps=police_stn,
    #     prompt="Help me choose my district using my police station given to you"
    #     " **STRICTLY** from the options given to you",
    # )
    
    district, ps = get_district_and_ps(police_stn)
    
    logger.debug("District options (truncated): %s", district_options[:50])
    logger.info("Selected district: %s", district)
    page.select_option("#district_id", label=district)

    # Select police station
    page.wait_for_function("() => document.querySelector('#ps_id').options.length > 1")
    ps_options = page.eval_on_selector(
        "#ps_id",
        'el => Array.from(el.options).slice(1).map(o => o.textContent.trim()).join(",")',
    )
    
    #NOTE: LLM is expensive, try exact match 
    # ps = ask_llm_options(
    #     options=ps_options,
    #     ps=police_stn,
    #     prompt="Help me choose the correct spelling of my police station"
    #     " **STRICTLY** from the options given to you",
    # )
    
    logger.debug("PS options (truncated): %s", ps_options[:65])
    logger.info("Selected police station: %s", ps)
    page.select_option("#ps_id", label=ps)

    # Fill remaining fields
    page.type("#fir_num", fir_num)
    page.type("#captcha", page.locator("div.captcha").inner_text())
    page.select_option("#year", label=fir_year)

    # Navigate through popups to reach PDF
    with page.expect_popup() as popup_info:
        page.click("input.btn.btn-primary.btn-lg.pull-right.btnfir")
    fir_list_page = popup_info.value
    fir_list_page.wait_for_load_state()

    with fir_list_page.expect_popup() as popup_info:
        fir_list_page.click("a.btn")
    fir_pdf_page = popup_info.value
    fir_pdf_page.wait_for_load_state()

    url = fir_pdf_page.url
    logger.info("FIR PDF URL: %s", url)
    return url


# ── Public orchestrator ──────────────────────────────────────────────────────
def scrape_case_data(cnr: str, *, headless: bool = False) -> dict:
    """Run the full scraping pipeline for a CNR number.

    Returns a dict with keys:
        - overview_img_b64  (str)
        - history           (list[dict])
        - fir_file_url      (str)
    """
    logger.info("Starting scrape for CNR: %s", cnr)

    with Browser() as b:
        page = b.page

        # eCourts: enter CNR + captcha
        page.goto(CASE_URL, wait_until="domcontentloaded")
        page.wait_for_timeout(1000)
        enter_cnr_and_solve_captcha(page, cnr)

        # Screenshot overview (inject borders first)
        page.add_style_tag(content=_TABLE_BORDER_CSS)
        overview_img_b64 = base64.b64encode(
            page.locator("#history_cnr").screenshot()
        ).decode("utf-8")

        # FIR details
        fir_html = page.locator("table.FIR_details_table").inner_html()
        police_stn, fir_num, fir_year = get_fir_details(html_table_to_rows(fir_html))
        logger.debug(f"FIR details: station={police_stn}, num={fir_num}, year={fir_year}")

        # Case history
        history = _extract_history(page)

        # FIR PDF
        fir_file_url = _lookup_fir_pdf_url(page, police_stn, fir_num, fir_year)

    logger.info("Scrape complete for CNR: %s", cnr)
    return {
        "overview_img_b64": overview_img_b64,
        "history": history,
        "fir_file_url": fir_file_url,
    }


# ── Interactive orchestrator (SSE-driven) ────────────────────────────────────
def _emit(eq: queue.Queue, type: SSEventType, content: str | None = None, metadata=None):
    eq.put(SSEvent(type=type, content=content, metadata=metadata))


def scrape_case_data_interactive(
    cnr: str,
    event_q: queue.Queue,
    input_q: queue.Queue,
) -> dict:
    """Run the scraping pipeline with SSE progress events and manual-input pauses.

    Puts ``SSEvent`` objects onto *event_q*. Blocks on *input_q*.get() when
    user interaction is required.  Returns the same dict as ``scrape_case_data``.
    """
    logger.info("Starting interactive scrape for CNR: %s", cnr)

    _emit(event_q, SSEventType.SUMMARY_LOG, "Thinking")

    with Browser() as b:
        page = b.page

        _emit(event_q, SSEventType.SUMMARY_LOG, "Starting gathering of case info")
        page.goto(CASE_URL, wait_until="domcontentloaded")
        page.wait_for_timeout(1000)
        page.locator("#cino").type(cnr, delay=70)
        page.wait_for_selector("#captcha_image", state="visible")

        # ── Captcha loop (user-solved) ───────────────────────────────
        for attempt in range(1, MAX_CAPTCHA_RETRIES + 1):
            img_bytes = page.locator("#captcha_image").screenshot()
            b64 = base64.b64encode(img_bytes).decode("utf-8")

            _emit(event_q, SSEventType.SUMMARY_LOG, "Requesting user to solve captcha")
            _emit(
                event_q,
                SSEventType.MANUAL_INPUT_REQUEST,
                metadata={
                    "type": "solve_captcha",
                    "captcha_img": b64,
                    **({"error": "Incorrect captcha, please try again"} if attempt > 1 else {}),
                },
            )

            user_resp = input_q.get()  # blocks
            captcha_text: str = user_resp.get("captcha_text", "")

            page.locator("#fcaptcha_code").type(captcha_text, delay=40)
            page.wait_for_timeout(50)
            page.click("#searchbtn")
            page.wait_for_timeout(500)

            if page.locator("div.loader-txt").is_visible():
                page.wait_for_selector("div.loader-txt", state="hidden", timeout=5000)

            if not page.locator("div.modal-body.p-1").is_visible():
                logger.info("Captcha solved on attempt %d", attempt)
                break

            logger.warning("Captcha wrong (attempt %d/%d)", attempt, MAX_CAPTCHA_RETRIES)
            if attempt < MAX_CAPTCHA_RETRIES:
                page.reload()
                page.wait_for_timeout(1000)
                page.locator("#cino").type(cnr, delay=70)
                page.wait_for_selector("#captcha_image", state="visible")
        else:
            raise RuntimeError(f"Failed to solve captcha after {MAX_CAPTCHA_RETRIES} attempts")

        # ── Case data extraction ─────────────────────────────────────
        _emit(event_q, SSEventType.SUMMARY_LOG, "Loading all hearings' data for case history")

        page.add_style_tag(content=_TABLE_BORDER_CSS)
        overview_img_b64 = base64.b64encode(
            page.locator("#history_cnr").screenshot()
        ).decode("utf-8")

        fir_html = page.locator("#history_cnr > table.FIR_details_table.table.table_o").inner_html()
        police_stn, fir_num, fir_year = get_fir_details(html_table_to_rows(fir_html))
        logger.debug("FIR details: station=%s, num=%s, year=%s", police_stn, fir_num, fir_year)

        history = _extract_history(page)

        # ── FIR PDF lookup (user picks district / PS) ────────────────
        _emit(event_q, SSEventType.SUMMARY_LOG, "Loading FIR details")
        page.goto(FIR_URL, wait_until="domcontentloaded")

        _emit(event_q, SSEventType.SUMMARY_LOG, "Requesting user to select FIR police station and district")
        _emit(
            event_q,
            SSEventType.MANUAL_INPUT_REQUEST,
            metadata={"type": "district_ps", "police_station": police_stn},
        )

        user_resp = input_q.get()  # blocks
        district: str = user_resp["district"]
        ps: str = user_resp["ps"]
        logger.info("User selected district=%s, ps=%s", district, ps)

        page.select_option("#district_id", label=district)
        page.wait_for_function("() => document.querySelector('#ps_id').options.length > 1")
        page.select_option("#ps_id", label=ps)

        page.type("#fir_num", fir_num)
        page.type("#captcha", page.locator("div.captcha").inner_text())
        page.select_option("#year", label=fir_year)

        with page.expect_popup() as popup_info:
            page.click("input.btn.btn-primary.btn-lg.pull-right.btnfir")
            
        fir_list_page = popup_info.value
        fir_list_page.wait_for_load_state("domcontentloaded")
        
        if "not" in fir_list_page.locator("body > div > h1").inner_text().lower():
            logger.warning("FIR PDF not found for given CNR number.")
            return {
                "overview_img_b64": overview_img_b64,
                "history": history,
                "fir_file_url": None,
            }

        with fir_list_page.expect_popup() as popup_info:
            fir_list_page.click("a.btn")
        fir_pdf_page = popup_info.value
        fir_pdf_page.wait_for_load_state()

        fir_file_url = fir_pdf_page.url
        logger.info("FIR PDF URL: %s", fir_file_url)

    logger.info("Interactive scrape complete for CNR: %s", cnr)
    return {
        "overview_img_b64": overview_img_b64,
        "history": history,
        "fir_file_url": fir_file_url,
    }
