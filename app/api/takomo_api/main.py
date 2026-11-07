"""FastAPI entry point. Run: uvicorn takomo_api.main:app --reload"""

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from . import __version__
from .config import get_settings
from .schema import SCHEMA_VERSION


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

    return app


app = create_app()
