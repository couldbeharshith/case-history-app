from pickle import load

with open("data/all_ps.bin", "rb") as f:
    all_ps: dict[str, list[str]] = load(f)
    
ps_variants = {
    (
        "hulsoor",
        "halasuru",
        "halasur",
        "halasooru",
        "halasoor",
        "halsoor",
        "alsoor",
        "ulsoor",
        "hulsur",
        "halsuru",
    ): "Halasur",
}

def normalize_case(name: str) -> str:
    words = name.lower().split()
    result = []

    for w in words:
        if w == "ps": result.append("PS")
        else: result.append(w.capitalize())

    return " ".join(result)


def get_district_and_ps(ps_name: str) -> tuple[str | None, str]:
    # ps_name will always be in uppercase
    #TODO: fuzzy search and better pattern matching
    # normalize ps name by removing common suffixes and correcting known variants
    # ps_name = ps_name.lower().replace(" police station", "").replace(" ps", "")
    # for variants, standard_name in ps_variants.items():
    #     if ps_name in variants:
    #         ps_name = standard_name
    
    if "HULSOOR" in ps_name.upper():
        ps_name = ps_name.replace("HULSOOR", "Halasur")
        return "Bengaluru City", normalize_case(ps_name)
    
    ps_name = normalize_case(ps_name)
    
    for key in all_ps.keys():
        ps_list = all_ps[key]
        if ps_name in ps_list:
            return key, ps_name
    return None, ps_name
