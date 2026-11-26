from __future__ import annotations

from collections.abc import Generator
from tempfile import TemporaryFile

import requests

from src.config import (
    CAPTCHA_PROMPT_FILE,
    OPENAI_MODEL,
    OPTIONS_PROMPT_FILE,
    SUMMARY_PROMPT_FILE,
    get_logger,
    get_openai_client,
    load_prompt,
)
from src.models import CaptchaText, OptionSelect

logger = get_logger(__name__)

MAX_FIR_BYTES = 512 * 1024 * 1024


def solve_captcha(b64_image: str) -> str:
    """Send a base-64 captcha image to the LLM and return the decoded text"""
    response = get_openai_client().responses.parse(
        model=OPENAI_MODEL,
        input=[
            {"role": "system", "content": load_prompt(CAPTCHA_PROMPT_FILE)},
            {
                "role": "user",
                "content": [
                    {
                        "type": "input_text",
                        "text": "what text is in this distorted image?",
                    },
                    {
                        "type": "input_image",
                        "image_url": f"data:image/png;base64,{b64_image}",
                        "detail": "high",
                    },
                ],
            },
        ],
        reasoning={"effort": "low"},
        text_format=CaptchaText,
    )
    text = response.output_parsed.text
    logger.debug("Captcha OCR result: %s", text)
    return text


def ask_llm_options(options: str, ps: str, prompt: str) -> str | None:
    """Ask the LLM to pick one option from a comma-separated list. Used for dropdown menu of FIR page"""
    response = get_openai_client().responses.parse(
        model=OPENAI_MODEL,
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
        (
            'Each entry of the case history is separated by "---". '
            "Note: Entries given below may not be of right chronological order.\n"
        )
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
    if not fir_url:
        return None

    try:
        with (
            requests.get(
                fir_url, stream=True, timeout=30, headers={"User-Agent": "Mozilla/5.0"}
            ) as response,
            TemporaryFile() as file,
        ):
            response.raise_for_status()
            size = 0
            for chunk in response.iter_content(64 * 1024):
                size += len(chunk)
                if size > MAX_FIR_BYTES:
                    raise ValueError("FIR file too large")
                file.write(chunk)

            file.seek(0)
            uploaded = get_openai_client().files.create(
                file=("fir.pdf", file, "application/pdf"), purpose="user_data"
            )
        return uploaded.id
    except Exception:
        logger.exception("FIR upload failed")
        return None


def _stream_text(messages: list[dict]) -> Generator[str]:
    with get_openai_client().responses.create(
        model=OPENAI_MODEL,
        input=messages,
        reasoning={"effort": "low"},
        stream=True,
    ) as stream:
        for event in stream:
            if event.type == "response.output_text.delta":
                yield event.delta
            elif event.type == "response.completed":
                return
            elif event.type in {"error", "response.failed", "response.incomplete"}:
                raise RuntimeError("The provider did not complete its response")
    raise RuntimeError("The provider closed the stream before completing its response")


def _case_attachments(overview_img_b64: str, file_id: str | None) -> list[dict]:
    parts = [
        {
            "type": "input_image",
            "image_url": f"data:image/png;base64,{overview_img_b64}",
            "detail": "high",
        }
    ]
    if file_id:
        parts.append({"type": "input_file", "file_id": file_id})
    return parts


def stream_summary(
    overview_img_b64: str,
    history: list[dict],
    file_id: str | None,
) -> Generator[str]:
    yield from _stream_text(
        [
            {"role": "system", "content": load_prompt(SUMMARY_PROMPT_FILE)},
            {
                "role": "user",
                "content": [
                    {"type": "input_text", "text": build_summary_text(history)},
                    *_case_attachments(overview_img_b64, file_id),
                ],
            },
        ]
    )


def stream_followup(
    summary: str,
    follow_up_messages: list[dict],
    overview_img_b64: str,
    file_id: str | None,
) -> Generator[str]:
    yield from _stream_text(
        [
            {"role": "system", "content": load_prompt(SUMMARY_PROMPT_FILE)},
            {"role": "user", "content": _case_attachments(overview_img_b64, file_id)},
            {"role": "assistant", "content": summary},
            *follow_up_messages,
        ]
    )
