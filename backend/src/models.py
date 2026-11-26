from enum import StrEnum
from typing import Annotated

from pydantic import BaseModel, StringConstraints

CHAT_ID_PATTERN = r"^[a-zA-Z0-9_-]{1,128}$"
NonEmptyText = Annotated[str, StringConstraints(strip_whitespace=True, min_length=1)]


class CaptchaText(BaseModel):
    text: str


class OptionSelect(BaseModel):
    option_to_choose: str | None


class SSEventType(StrEnum):
    TEXT_CHUNK = "text_chunk"
    COMPLETE = "complete"
    SUMMARY_LOG = "summary_log"
    MANUAL_INPUT_REQUEST = "manual_input_request"


class SSEvent(BaseModel):
    type: SSEventType
    content: str | None
    metadata: dict[str, str] | str | None = None


class ManualInput(BaseModel):
    captcha_text: NonEmptyText | None = None
    district: NonEmptyText | None = None
    ps: NonEmptyText | None = None


class ChatRequest(BaseModel):
    chat_id: Annotated[str, StringConstraints(pattern=CHAT_ID_PATTERN)]
    question: NonEmptyText
