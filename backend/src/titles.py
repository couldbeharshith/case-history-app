import re

from openai import OpenAIError
from pydantic import BaseModel

from src.config import OPENAI_MODEL, get_logger, get_openai_client

logger = get_logger(__name__)
_MAX_TITLE_CHARS = 72
_GENERIC_TITLES = {"case", "case summary", "case details", "legal case", "court case"}


class CaseTitle(BaseModel):
    title: str | None


def generate_case_title(summary: str, cnr_num: str) -> str | None:
    try:
        result = (
            get_openai_client()
            .with_options(timeout=8, max_retries=0)
            .responses.parse(
                model=OPENAI_MODEL,
                reasoning={"effort": "none"},
                max_output_tokens=120,
                input=[
                    {
                        "role": "system",
                        "content": (
                            "Write a short, neutral title for a legal case using only the supplied "
                            "summary. Prefer the named case caption or a specific case type and issue. "
                            "Return a title of at most eight words or null if the summary has no "
                            "reliable identifying details. Omit CNR and other record numbers."
                        ),
                    },
                    {"role": "user", "content": summary},
                ],
                text_format=CaseTitle,
            )
        )
        title = _clean_title(
            result.output_parsed.title if result.output_parsed else None, cnr_num
        )
        if title:
            return title
    except (OpenAIError, ValueError):
        logger.info("Case title generation unavailable; using summary details")

    plain_summary = summary.replace("**", "").replace("__", "")
    case_type = re.search(
        r"^\s*(?:[-*]\s+)?(?:Case type|Nature of case)\s*:\s*(\S[^\r\n]*)",
        plain_summary,
        flags=re.IGNORECASE | re.MULTILINE,
    )
    if case_type:
        name = re.sub(r"^[A-Z.]{1,8}\s*[-–]\s*", "", case_type.group(1))
        return _clean_title(name.rstrip("."), cnr_num)
    return None


def _clean_title(value: str | None, cnr_num: str) -> str | None:
    title = " ".join((value or "").split()).strip("#*_\"' ")
    if (
        not title
        or title.casefold() in _GENERIC_TITLES
        or cnr_num.casefold() in title.casefold()
    ):
        return None
    if len(title) <= _MAX_TITLE_CHARS:
        return title
    return title[:_MAX_TITLE_CHARS].rsplit(" ", 1)[0] or None
