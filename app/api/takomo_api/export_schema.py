"""Write the shared JSON Schema: python -m takomo_api.export_schema [--check]"""

import json
import sys
from pathlib import Path

from pydantic.json_schema import models_json_schema

from .schema import FitRequest, FitState

OUT = Path(__file__).resolve().parents[2] / "shared" / "fit_state.schema.json"
# reason_codes.json is edited in app/shared; a copy ships inside the package (Docker context = app/api).
CODES_SRC = Path(__file__).resolve().parents[2] / "shared" / "reason_codes.json"
CODES_PKG = Path(__file__).resolve().parent / "data" / "reason_codes.json"


def build() -> str:
    _, defs = models_json_schema([(FitRequest, "validation"), (FitState, "serialization")], title="Takomo fit state v1")
    return json.dumps(defs, indent=2, sort_keys=True) + "\n"


def main() -> None:
    text = build()
    if "--check" in sys.argv:
        if not OUT.exists() or OUT.read_text() != text:
            sys.exit(f"{OUT} is out of date: run python -m takomo_api.export_schema")
        if CODES_PKG.read_text() != CODES_SRC.read_text():
            sys.exit(f"{CODES_PKG} differs from {CODES_SRC}: run python -m takomo_api.export_schema")
        print("schema + reason codes up to date")
        return
    OUT.write_text(text)
    CODES_PKG.write_text(CODES_SRC.read_text())
    print(f"wrote {OUT} and synced {CODES_PKG}")


if __name__ == "__main__":
    main()
