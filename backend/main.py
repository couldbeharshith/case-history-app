"""CLI entry point — scrape a case by CNR and print the streamed summary."""

from src.config import get_logger
from src.llm import stream_summary
from src.scraper import scrape_case_data

logger = get_logger(__name__)


def main() -> None:
    cnr = "KABC0A0015162024"
    logger.info("CLI run for CNR: %s", cnr)

    data = scrape_case_data(cnr)

    for chunk in stream_summary(
        overview_img_b64=data["overview_img_b64"],
        history=data["history"],
        fir_file_url=data["fir_file_url"],
    ):
        print(chunk, end="", flush=True)

    print()


if __name__ == "__main__":
    main()
