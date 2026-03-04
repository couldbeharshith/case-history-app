from enum import Enum

from pydantic import BaseModel


class CaptchaText(BaseModel):
    text: str


class OptionSelect(BaseModel):
    option_to_choose: str | None


class SSEventType(str, Enum):
    TEXT_CHUNK = "text_chunk"
    SUMMARY_LOG = "summary_log"
    MANUAL_INPUT_REQUEST = "manual_input_request" # to ask user to solve captcha text and choose district/PS


class SSEvent(BaseModel):
    type: SSEventType
    content: str | None
    metadata: dict[str, str] | str | None = None
