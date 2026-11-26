"""Centralised configuration for env, logging, constants, OpenAI client, inmemory prompt cache."""

import logging
import os
from functools import lru_cache
from pathlib import Path

from dotenv import load_dotenv
from openai import OpenAI

# Load .env from the project root with override=True to replace any existing env vars
_project_root = Path(__file__).parent.parent.parent
load_dotenv(_project_root / ".env", override=True)

# Verify the API key is loaded
_api_key = os.getenv("OPENAI_API_KEY")
if not _api_key:
    raise ValueError("OPENAI_API_KEY not found in environment or .env file")


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
HEADLESS = os.getenv("HEADLESS", "0").lower() in ("1", "true", "yes", "y")

# Global OpenAI client instance - initialized after .env is loaded
client = OpenAI(api_key=_api_key)


@lru_cache(maxsize=None)
def load_prompt(file: Path) -> str:
    """Read a prompt file and cache the result for process lifetime"""
    return file.read_text(encoding="utf-8").strip()
