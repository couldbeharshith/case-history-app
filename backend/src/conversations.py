import base64
import os
from functools import cached_property
from json import loads
from pathlib import Path
from tempfile import NamedTemporaryFile
from typing import Literal

from pydantic import BaseModel, Field, field_validator


class Message(BaseModel):
    role: Literal["user", "assistant"]
    content: str


class Conversation(BaseModel):
    cnr_num: str
    extract_fir: bool = True
    fir_file_url: str | None = None
    summary: str
    messages: list[Message] = Field(default_factory=list)
    overview_img_b64: str | None = None

    @field_validator("summary")
    @classmethod
    def require_summary(cls, summary: str) -> str:
        if not summary.strip():
            raise ValueError("A completed summary is required")
        return summary


class ConversationStore:
    def __init__(self, directory: Path) -> None:
        self.directory = directory

    @cached_property
    def stations(self) -> dict[str, list[str]]:
        return load_stations(self.directory / "all_ps.json")

    def read(self, chat_id: str) -> Conversation | None:
        directory = self.directory / chat_id
        try:
            raw = (directory / "conv_history.json").read_bytes()
        except FileNotFoundError:
            return None

        # Earlier versions initialized this file before a summary was available.
        data = loads(raw)
        if not data.get("summary"):
            return None

        conversation = Conversation.model_validate(data)
        if not conversation.overview_img_b64:
            image = (directory / "case_overview.png").read_bytes()
            conversation.overview_img_b64 = base64.b64encode(image).decode("ascii")
        return conversation

    def write(self, chat_id: str, conversation: Conversation) -> None:
        directory = self.directory / chat_id
        directory.mkdir(parents=True, exist_ok=True)
        destination = directory / "conv_history.json"
        with NamedTemporaryFile(dir=directory, delete=False) as temporary:
            path = Path(temporary.name)
            try:
                temporary.write(conversation.model_dump_json().encode("utf-8"))
                temporary.flush()
                os.fsync(temporary.fileno())
                temporary.close()
                os.replace(path, destination)
            finally:
                path.unlink(missing_ok=True)


def load_stations(path: Path) -> dict[str, list[str]]:
    return loads(path.read_text(encoding="utf-8"))
