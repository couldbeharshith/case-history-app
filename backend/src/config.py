"""Centralised configuration for env, logging, constants, OpenAI client, inmemory prompt cache."""

import logging
import os
from functools import lru_cache
from pathlib import Path

from dotenv import load_dotenv
from openai import OpenAI

load_dotenv()


logging.basicConfig(
    level=logging.WARNING,
    format=r"%(asctime)s | %(name)s | %(levelname)s | %(message)s",
)

_APP_LOG_LEVEL = os.getenv("LOG_LEVEL", "INFO").upper()


def get_logger(name: str) -> logging.Logger:
    lgr = logging.getLogger(name)
    lgr.setLevel(_APP_LOG_LEVEL)
    return lgr


# Global Constants
CASE_URL = "https://services.ecourts.gov.in/ecourtindia_v6/"
FIR_URL = "https://ksp.karnataka.gov.in/firsearch/en"

_PROMPTS_DIR = Path(__file__).parent.parent / "prompts"
CAPTCHA_PROMPT_FILE = _PROMPTS_DIR / "captcha_prompt.md"
SUMMARY_PROMPT_FILE = _PROMPTS_DIR / "summary_prompt.md"
OPTIONS_PROMPT_FILE = _PROMPTS_DIR / "options_prompt.md"

MAX_CAPTCHA_RETRIES = 3

# Global OA client instance
client = OpenAI()


@lru_cache(maxsize=None)
def load_prompt(file: Path) -> str:
    """Read a prompt file and cache the result for process lifetime"""
    return file.read_text(encoding="utf-8").strip()
