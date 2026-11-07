"""FastAPI entry point. Run: uvicorn takomo_api.main:app --reload"""

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from . import __version__
from .config import get_settings
from .engine import fit as engine
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

    return app


app = create_app()
