"""FastAPI entry point. Run: uvicorn takomo_api.main:app --reload"""

from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel

from . import __version__
from .config import get_settings
from .engine import fit as engine
from .llm import registry
from .llm.explain import Explanation, Role, explain
from .schema import SCHEMA_VERSION, FitRequest, FitState


def create_app() -> FastAPI:
    settings = get_settings()
    app = FastAPI(title="Takomo Fitter API", version=__version__)
    app.add_middleware(
        CORSMiddleware,
        allow_origins=settings.cors_origin_list,
        allow_methods=["GET", "POST", "PUT"],
        allow_headers=["*"],
    )

    @app.get("/health")
    def health() -> dict:
        return {"status": "ok", "version": __version__, "schema_version": SCHEMA_VERSION, "env": settings.env}

    @app.post("/v1/fit", response_model=FitState)
    def fit(req: FitRequest) -> FitState:
        """Run the engine for the current step. Cheap + deterministic: call after every step."""
        return engine.run(req)

    class ExplainRequest(BaseModel):
        state: FitState
        role: Role = "step_line"

    @app.post("/v1/explain", response_model=Explanation)
    def explain_fit(req: ExplainRequest) -> Explanation:
        """Host lines for a fit state. Never fails: falls back to reason-code templates."""
        return explain(req.state, req.role)

    class RoleSetting(BaseModel):
        provider: str
        model: str

    @app.get("/v1/settings")
    def get_llm_settings() -> dict:
        return registry.snapshot() | {"demo_mode": settings.demo_mode}

    @app.put("/v1/settings")
    def put_llm_settings(roles: dict[str, RoleSetting]) -> dict:
        """Runtime provider/model switch for the demo panel. Only when TAKOMO_DEMO_MODE=true."""
        if not settings.demo_mode:
            raise HTTPException(403, "settings are read-only outside demo mode")
        try:
            for role, cfg in roles.items():
                registry.set_role(role, registry.RoleConfig(cfg.provider, cfg.model))
        except ValueError as e:
            raise HTTPException(422, str(e)) from e
        return registry.snapshot() | {"demo_mode": settings.demo_mode}

    return app


app = create_app()
