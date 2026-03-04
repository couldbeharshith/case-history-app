"""All LLM interactions: captcha solving, option selection, summary generation."""

from __future__ import annotations

from typing import Generator

import requests

from src.config import (
    CAPTCHA_PROMPT_FILE,
    OPTIONS_PROMPT_FILE,
    SUMMARY_PROMPT_FILE,
    client,
    get_logger,
    load_prompt,
)
from src.models import CaptchaText, OptionSelect

logger = get_logger(__name__)


def solve_captcha(b64_image: str) -> str:
    """Send a base-64 captcha image to the LLM and return the decoded text"""
    response = client.responses.parse(
        model="gpt-5-nano",
        input=[
            {"role": "system", "content": load_prompt(CAPTCHA_PROMPT_FILE)},
            {
                "role": "user",
                "content": [
                    {"type": "input_text", "text": "what text is in this distorted image?"},
                    {
                        "type": "input_image",
                        "image_url": f"data:image/png;base64,{b64_image}",
                        "detail": "high",
                    },
                ],
            },
        ],
        reasoning={"effort": "minimal"},
        text_format=CaptchaText,
    )
    text = response.output_parsed.text
    logger.debug("Captcha OCR result: %s", text)
    return text


def ask_llm_options(options: str, ps: str, prompt: str) -> str | None:
    """Ask the LLM to pick one option from a comma-separated list. Used for dropdown menu of FIR page"""
    response = client.responses.parse(
        model="gpt-5-nano",
        input=[
            {"role": "system", "content": load_prompt(OPTIONS_PROMPT_FILE)},
            {
                "role": "user",
                "content": f"Options: `{options}`\nMy police station: {ps}\n{prompt}",
            },
        ],
        reasoning={"effort": "medium"},
        text_format=OptionSelect,
    )
    choice = response.output_parsed.option_to_choose
    logger.debug("LLM option choice: %s", choice)
    return choice


def build_summary_text(history: list[dict[str, str]]) -> str:
    """Convert case history rows into the prompt text fed to the summary LLM"""
    parts: list[str] = [
        'Each entry of the case history is separated by "---". '
        "Note: Entries given below may not be of right chronological order.\n"
    ]
    for entry in history:
        parts.append(
            f"---\n"
            f"Judge: {entry['judge']}\n"
            f"Business On Date: {entry['business_on_date']}\n"
            f"Hearing Date: {entry['hearing_date']}\n"
            f"Purpose Of Hearing: {entry['purpose']}\n"
            f"Content (Main Event): {entry['content']}\n"
            f"Row number: {entry['row_num']}"
        )
    parts.append("\n===END===")
    return "\n".join(parts)


def upload_fir_file(fir_url: str | None) -> str | None:
    """Download the FIR PDF from a URL and upload it to the OpenAI files API.

    Returns the file_id, or ``None`` when the FIR was not available.
    """
    if not fir_url:
        logger.info("FIR URL is None – skipping upload")
        return None

    try:
        resp = requests.get(
            fir_url,
            timeout=30,
            headers={"User-Agent": "Mozilla/5.0"},
        )
        resp.raise_for_status()

        file_bytes = resp.content

        if len(file_bytes) > 512 * 1024 * 1024:
            raise ValueError("FIR file too large")

        uploaded = client.files.create(
            file=("fir.pdf", file_bytes, "application/pdf"),
            purpose="user_data",
        )

        logger.debug("Uploaded FIR file, id=%s", uploaded.id)
        return uploaded.id

    except Exception as e:
        logger.exception("FIR upload failed: %s", e)
        return None


def stream_summary(
    overview_img_b64: str,
    history: list[dict],
    file_id: str | None,
) -> Generator[str, None, None]:
    """Yield summary text chunks as they stream from the LLM.

    Works identically for the CLI (print each chunk) and the API (yield to
    StreamingResponse).  When *file_id* is ``None`` (FIR not available) the
    file attachment is simply omitted.
    """
    user_content: list[dict] = [
        {"type": "input_text", "text": build_summary_text(history)},
        {
            "type": "input_image",
            "image_url": f"data:image/png;base64,{overview_img_b64}",
            "detail": "high",
        },
    ]
    if file_id:
        user_content.append({"type": "input_file", "file_id": file_id})

    stream = client.responses.create(
        model="gpt-5-nano",
        input=[
            {"role": "system", "content": load_prompt(SUMMARY_PROMPT_FILE)},
            {"role": "user", "content": user_content},
        ],
        reasoning={"effort": "low"},
        stream=True,
    )

    for event in stream:
        if event.type == "response.output_text.delta":
            yield event.delta


def stream_followup(
    summary: str,
    follow_up_messages: list[dict],
    overview_img_b64: str,
    file_id: str | None,
) -> Generator[str, None, None]:
    """Stream a follow-up answer, reconstructing full context each time.

    The LLM sees:
      1. System prompt
      2. Rich context message (overview image + optional FIR PDF)
      3. Assistant message with the stored summary
      4. All follow-up user/assistant turns
    """
    context_content: list[dict] = [
        {
            "type": "input_image",
            "image_url": f"data:image/png;base64,{overview_img_b64}",
            "detail": "high",
        },
    ]
    if file_id:
        context_content.append({"type": "input_file", "file_id": file_id})

    context_message: dict = {
        "role": "user",
        "content": context_content,
    }

    llm_input = [
        {"role": "system", "content": load_prompt(SUMMARY_PROMPT_FILE)},
        context_message,
        {"role": "assistant", "content": summary},
        *[
            {"role": m["role"], "content": m["content"]}
            for m in follow_up_messages
        ],
    ]

    stream = client.responses.create(
        model="gpt-5-nano",
        input=llm_input,
        reasoning={"effort": "low"},
        stream=True,
    )

    for event in stream:
        if event.type == "response.output_text.delta":
            yield event.delta
