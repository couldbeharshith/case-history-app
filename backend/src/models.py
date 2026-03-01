from pydantic import BaseModel


class CaptchaText(BaseModel):
    text: str


class OptionSelect(BaseModel):
    option_to_choose: str | None
