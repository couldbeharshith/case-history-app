import logging
import os
from functools import cache, lru_cache
from pathlib import Path

from dotenv import load_dotenv
from openai import OpenAI

# Load .env from the project root with override=True to replace any existing env vars
_project_root = Path(__file__).parent.parent.parent
load_dotenv(_project_root / ".env", override=True)


logging.basicConfig(
    level=logging.WARNING,
    format=r"%(asctime)s | %(name)s | %(levelname)s | %(message)s",
)

_APP_LOG_LEVEL = os.getenv("LOG_LEVEL") or "INFO"


def get_logger(name: str) -> logging.Logger:
    logger = logging.getLogger(name)
    logger.setLevel(_APP_LOG_LEVEL.upper())
    return logger


CASE_URL = "https://services.ecourts.gov.in/ecourtindia_v6/"
FIR_URL = "https://ksp.karnataka.gov.in/firsearch/en"

BACKEND_DIR = Path(__file__).resolve().parents[1]
DATA_DIR = BACKEND_DIR / "data"
_PROMPTS_DIR = BACKEND_DIR / "prompts"
CAPTCHA_PROMPT_FILE = _PROMPTS_DIR / "captcha_prompt.md"
SUMMARY_PROMPT_FILE = _PROMPTS_DIR / "summary_prompt.md"
OPTIONS_PROMPT_FILE = _PROMPTS_DIR / "options_prompt.md"

OPENAI_MODEL = "gpt-6-luna"
MAX_CAPTCHA_RETRIES = 3
HEADLESS = os.getenv("HEADLESS", "0").lower() in ("1", "true", "yes", "y")


@lru_cache(maxsize=1)
def get_openai_client() -> OpenAI:
    api_key = os.getenv("OPENAI_API_KEY")
    if not api_key:
        raise ValueError("OPENAI_API_KEY not found in environment or .env file")
    return OpenAI(api_key=api_key, timeout=90, max_retries=1)


@cache
def load_prompt(file: Path) -> str:
    return file.read_text(encoding="utf-8").strip()
