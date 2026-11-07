from takomo_api import export_schema
from takomo_api.schema import FitRequest, FitState


def test_shared_schema_in_sync():
    assert export_schema.OUT.read_text() == export_schema.build()


def test_empty_request_is_valid():
    req = FitRequest(step="intro")
    assert req.answers.height_cm is None


def test_fit_state_roundtrip():
    state = FitState.model_validate(
        {
            "step": "profile",
            "buildable": True,
            "parts": {
                "length": {
                    "part": "length",
                    "value": 0.5,
                    "label": "+0.5 in",
                    "confidence": 0.7,
                    "range": {"low": 0, "high": 1},
                    "evidence": ["asked"],
                    "reasons": [{"code": "LENGTH_FROM_HEIGHT", "params": {"height_cm": 185}}],
                }
            },
        }
    )
    assert FitState.model_validate_json(state.model_dump_json()) == state
