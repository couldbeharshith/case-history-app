"""Playwright browser lifecycle."""

from contextlib import ExitStack
from typing import Self

from playwright.sync_api import Page, Route, sync_playwright

from src.config import get_logger

logger = get_logger(__name__)

# Resources that are always blocked (saves bandwidth & render time)
_BLOCKED_RESOURCE_TYPES = frozenset({"stylesheet", "font"})
_CAPTCHA_URL_FRAGMENT = "securimage_show.php"

_BROWSER_ARGS: list[str] = [
    "--disable-extensions",
    "--disable-gpu",
    "--disable-web-security",
    "--disable-features=IsolateOrigins,site-per-process",
    "--disable-site-isolation-trials",
    "--disable-background-networking",
    "--disable-default-apps",
    "--disable-sync",
    "--no-first-run",
    "--disable-component-update",
    "--disable-domain-reliability",
    "--disable-features=TranslateUI",
    "--metrics-recording-only",
]


class Browser:
    """Thin wrapper around Playwright that blocks unnecessary resources."""

    def __init__(self, headless: bool = False) -> None:
        self._resources = ExitStack()
        self._headless = headless
        self.page: Page

    @staticmethod
    def _route_handler(route: Route) -> None:
        req = route.request
        rtype = req.resource_type

        if rtype in _BLOCKED_RESOURCE_TYPES:
            route.abort()
            return

        if rtype == "image":
            if _CAPTCHA_URL_FRAGMENT in req.url:
                route.continue_()
            else:
                route.abort()
            return

        route.continue_()

    def start(self, *, headless: bool | None = None) -> Self:
        if headless is None:
            headless = self._headless

        with ExitStack() as resources:
            playwright = resources.enter_context(sync_playwright())
            browser = playwright.chromium.launch(headless=headless, args=_BROWSER_ARGS)
            resources.callback(browser.close)
            context = browser.new_context(java_script_enabled=True, bypass_csp=True)
            resources.callback(context.close)
            self.page = context.new_page()
            self.page.route("**/*", self._route_handler)
            self._resources = resources.pop_all()

        logger.debug("Browser started (headless=%s)", headless)
        return self

    def stop(self) -> None:
        self._resources.close()
        logger.debug("Browser stopped")

    def __enter__(self) -> Self:
        return self.start()

    def __exit__(self, *exc) -> None:
        self.stop()
