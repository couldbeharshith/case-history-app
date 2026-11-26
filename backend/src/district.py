import re
from functools import cache

from src.config import DATA_DIR
from src.conversations import load_stations


@cache
def _station_districts() -> dict[str, str]:
    index: dict[str, str] = {}
    for district, stations in load_stations(DATA_DIR / "all_ps.json").items():
        for station in stations:
            index.setdefault(station, district)
    return index


def get_district_and_ps(ps_name: str) -> tuple[str | None, str]:
    if "HULSOOR" in ps_name.upper():
        ps_name = re.sub("hulsoor", "Halasur", ps_name, flags=re.IGNORECASE)
        return "Bengaluru City", _normalize_case(ps_name)

    station = _normalize_case(ps_name)
    return _station_districts().get(station), station


def _normalize_case(name: str) -> str:
    return " ".join(
        "PS" if word == "ps" else word.capitalize() for word in name.lower().split()
    )
