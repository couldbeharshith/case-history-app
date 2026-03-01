"""Playwright browser lifecycle."""

from playwright.sync_api import sync_playwright

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

    __slots__ = ("_pw", "_browser", "_context", "page")

    def __init__(self) -> None:
        self._pw = None
        self._browser = None
        self._context = None
        self.page = None

    @staticmethod
    def _route_handler(route) -> None:
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

    def start(self, *, headless: bool = False) -> "Browser":
        """Start browser instance with resource blocking enabled."""
        self._pw = sync_playwright().start()
        self._browser = self._pw.chromium.launch(
            headless=headless,
            args=_BROWSER_ARGS,
        )
        self._context = self._browser.new_context(
            java_script_enabled=True,
            bypass_csp=True,
        )
        self.page = self._context.new_page()
        self.page.route("**/*", self._route_handler)
        logger.debug("Browser started (headless=%s)", headless)
        return self

    def stop(self) -> None:
        if self._browser:
            self._browser.close()
        if self._pw:
            self._pw.stop()
        logger.debug("Browser stopped")

    # Python context manager support
    def __enter__(self) -> "Browser":
        return self.start()

    def __exit__(self, *exc) -> None:
        self.stop()
