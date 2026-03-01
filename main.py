import base64
from openai import OpenAI
from dotenv import load_dotenv
from playwright.sync_api import sync_playwright, Page
from pathlib import Path
from pydantic import BaseModel
from bs4 import BeautifulSoup
import re

import requests

load_dotenv()


CASE_URL = "https://services.ecourts.gov.in/ecourtindia_v6/"
FIR_URL = "https://ksp.karnataka.gov.in/firsearch/en"
CAPTCHA_PROMPT_FILE = Path(__file__).parent / "captcha_prompt.md"
SUMMARY_PROMPT_FILE = Path(__file__).parent / "summary_prompt.md"
OPTIONS_PROMPT_FILE = Path(__file__).parent / "options_prompt.md"


class CaptchaText(BaseModel):
    text: str


class OptionSelect(BaseModel):
    option_to_choose: str | None


def ask_llm_options(options: str, ps: str, prompt: str) -> str | None:
    client = OpenAI()

    input_items: list = [
        {"role": "system", "content": load_prompt_file(OPTIONS_PROMPT_FILE)},
        {
            "role": "user",
            "content": f"Options: `{options}`\nmy police station: {ps}\n{prompt}",
        },
    ]

    response = client.responses.parse(
        model="gpt-5-mini",
        input=input_items,
        reasoning={"effort": "medium"},
        text_format=OptionSelect,
    )
    out = response.output_parsed
    return out.option_to_choose


def load_prompt_file(file: Path) -> str:
    text = file.read_text(encoding="utf-8").strip()
    return text


class Browser:
    def __init__(self):
        self._pw = None
        self._browser = None
        self._context = None
        self.page = None

    def _route_handler(self, route):
        request = route.request
        url = request.url
        rtype = request.resource_type

        # Block fonts + css
        if rtype in ["stylesheet", "font"]:
            route.abort()
            return

        # Block all images except captcha
        if rtype == "image":
            if "securimage_show.php" in url:
                route.continue_()
            else:
                route.abort()
            return

        route.continue_()

    def start(self):
        self._pw = sync_playwright().start()
        self._browser = self._pw.chromium.launch(
            headless=False,
            args=[
                "--disable-extensions",
                "--disable-gpu",
                "--disable-web-security",
                "--disable-features=IsolateOrigins,site-per-process",
                "--disable-site-isolation-trials",
                "--disable-background-networking",
                "--disable-default-apps",
                "--disable-sync",
                "--no-first-run",
                "--disable-component-update",
                "--disable-domain-reliability",
                "--disable-features=TranslateUI",
                "--metrics-recording-only",
            ],
        )
        self._context = self._browser.new_context(
            java_script_enabled=True,
            bypass_csp=True,
        )

        self.page = self._context.new_page()
        self.page.route("**/*", self._route_handler)

        return self

    def stop(self):
        if self._browser:
            self._browser.close()
        if self._pw:
            self._pw.stop()


def solve_captcha(bs64: str) -> str:
    client = OpenAI()

    input_items: list = [
        {"role": "system", "content": load_prompt_file(CAPTCHA_PROMPT_FILE)},
        {
            "role": "user",
            "content": [
                {"type": "input_text", "text": "what text is in this distorted image?"},
                {
                    "type": "input_image",
                    "image_url": f"data:image/png;base64,{bs64}",
                    "detail": "high",
                },
            ],
        },
    ]

    response = client.responses.parse(
        model="gpt-5-nano",
        input=input_items,
        reasoning={"effort": "minimal"},
        text_format=CaptchaText,
    )

    print(out := response.output_parsed.text)
    return out


def build_summary_text(history: list[dict[str, str]]) -> str:

    text = 'Each entry of the case history is seperated by "---". Note: Entries given below may not be of right chronological order.\n\n'

    for content in history:
        text += f"""---
Judge: {content["judge"]}
Business On Date: {content["business_on_date"]}
Hearing Date: {content["hearing_date"]}
Purpose Of Hearing: {content["purpose"]}
Content (Main Event): {content["content"]}
Row number: {content["row_num"]}
"""

    text += "\n===END==="

    return text


def get_summary(overview_img_b64: str, history: list[dict], FIR_file_url: str) -> None:
    client = OpenAI()
    file_bytes = requests.get(FIR_file_url).content

    file = client.files.create(
        file=("fir.pdf", file_bytes, "application/pdf"), purpose="user_data"
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
            print(event.delta, end="", flush=True)

    print()


def html_table_to_rows(table_html: str) -> list[str]:
    soup = BeautifulSoup(table_html, "html.parser")

    rows = []
    for tr in soup.select("tr"):
        cells = []
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


def get_FIR_details(FIR_rows: list[str]) -> tuple[str, str, str]:
    stn_row, num_row, year_row = FIR_rows[-3:]
    police_stn, num, year = stn_row[1].strip(), num_row[1].strip(), year_row[1].strip()

    lPadding = 4 - len(num)  # left pad with 0 for 4 digit number
    num = "0" * lPadding + num

    return police_stn, num, year


def enter_CNR_and_solve_captcha(page: Page, CNR: str) -> None:
    while True:
        page.locator("#cino").type(CNR, delay=70)
        page.wait_for_selector("#captcha_image", state="visible")

        captcha_img_bytes = page.locator("#captcha_image").screenshot()
        captcha_img_b64 = base64.b64encode(captcha_img_bytes).decode("utf-8")

        captcha = solve_captcha(captcha_img_b64)
        page.locator("#fcaptcha_code").type(captcha, delay=40)
        page.wait_for_timeout(100)
        page.click("#searchbtn")
        page.wait_for_timeout(500)
        
        
        if not page.locator("div.modal-body.p-1").is_visible():
            print("Captcha solved successfully!")
            break
        else:
            page.reload()
            print("Captcha was wrong. Retrying...")

def main():
    CNR = "KABC0A00151620243"
    b = Browser().start()
    page = b.page
    try:
        #! Open record and captcha
        page.goto(CASE_URL, wait_until="domcontentloaded")
        page.wait_for_timeout(1000)

        #! Enter CNR and solve captcha (with retry if wrong) 
        enter_CNR_and_solve_captcha(page=page, CNR=CNR)

        #! inject table border css

        page.add_style_tag(
            content="""
        table, th, td {
            border: 1px solid black !important;
            border-collapse: collapse !important;
        }
        div {
            padding: 10px;
        }
        """
        )

        #! Get main overview IMAGE of case
        overview_img_bytes = page.locator("#history_cnr").screenshot()
        overview_img_b64 = base64.b64encode(overview_img_bytes).decode("utf-8")

        #! Get FIR details
        FIR_table_html = page.locator("table.FIR_details_table").inner_html()
        FIR_rows = html_table_to_rows(table_html=FIR_table_html)
        police_stn, FIR_num, FIR_year = get_FIR_details(FIR_rows=FIR_rows)

        #! Extract history table data
        history_table_html = page.locator("table.history_table").inner_html()

        history_rows = html_table_to_rows(table_html=history_table_html)
        history_rows = history_rows[1:]  # remove headings row

        history = []
        for i, row in enumerate(history_rows):
            judge, info, hearing_date, purpose = row

            onclick = info["onclick"]
            business_on_date = onclick.split(",")[6]

            page.evaluate(onclick)
            page.wait_for_load_state("domcontentloaded")

            page.wait_for_timeout(500)

            content = page.locator("#mydiv").inner_text()

            content = re.sub(
                r"\t+", "\t", content
            )  # replace multiple conseqcutive \t with singular \t

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

        #! get FIR document

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
        print("===========")
        print(district_options[:50])
        page.select_option("#district_id", label=district)

        page.wait_for_function(
            "() => document.querySelector('#ps_id').options.length > 1"
        )

        ps_options = page.eval_on_selector(
            "#ps_id",
            'select => Array.from(select.options).slice(1).map(o => o.textContent.trim()).join(",")',
        )

        print(ps_options[:65])
        print("==========")
        ps = ask_llm_options(
            options=ps_options,
            ps=police_stn,
            prompt="Help me choose the correct spelling of my police station **STRICTLY** from the options given to you",
        )

        page.select_option("#ps_id", label=ps)

        page.type("#fir_num", FIR_num)
        captcha = page.locator("div.captcha").inner_text()
        page.type("#captcha", captcha)
        page.select_option("#year", label=FIR_year)

        # print(f"DISTRICT LABEL: {label}")
        with page.expect_popup() as popup_info:
            page.click("input.btn.btn-primary.btn-lg.pull-right.btnfir")

        new_page = popup_info.value
        new_page.wait_for_load_state()
        page = new_page

        with page.expect_popup() as popup_info:
            page.click("a.btn")

        final_page = popup_info.value
        final_page.wait_for_load_state()
        page = final_page

        print(page.url)
        # breakpoint()

        #! Get final summary
        get_summary(
            overview_img_b64=overview_img_b64, history=history, FIR_file_url=page.url
        )
    finally:
        b.stop()


if __name__ == "__main__":
    main()
