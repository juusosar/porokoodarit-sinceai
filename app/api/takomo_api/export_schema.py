"""Write the shared JSON Schema: python -m takomo_api.export_schema [--check]"""

import json
import sys
from pathlib import Path

from pydantic.json_schema import models_json_schema

from .schema import FitRequest, FitState

OUT = Path(__file__).resolve().parents[2] / "shared" / "fit_state.schema.json"


def build() -> str:
    _, defs = models_json_schema([(FitRequest, "validation"), (FitState, "serialization")], title="Takomo fit state v1")
    return json.dumps(defs, indent=2, sort_keys=True) + "\n"


def main() -> None:
    text = build()
    if "--check" in sys.argv:
        if not OUT.exists() or OUT.read_text() != text:
            sys.exit(f"{OUT} is out of date: run python -m takomo_api.export_schema")
        print("schema up to date")
        return
    OUT.write_text(text)
    print(f"wrote {OUT}")


if __name__ == "__main__":
    main()
