"""FastAPI entry point. Run: uvicorn takomo_api.main:app --reload"""

import hmac
import logging
import threading
from contextlib import asynccontextmanager

from fastapi import FastAPI, Header, HTTPException, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from pydantic import BaseModel

from . import __version__
from .config import get_settings
from .engine import fit as engine
from .llm import registry
from .llm.chat import ChatReply, ChatRequest, chat, speakable, warmup
from .llm.explain import Explanation, Role, explain
from .ratelimit import RateLimiter, client_key
from .schema import SCHEMA_VERSION, FitRequest, FitState
from .swing.measure import analyze as analyze_swing
from .swing.schema import SwingAnalysis, SwingAnalyzeRequest
from .tts import router as voice

# App logs (LLM latency, fallback causes) to stderr at INFO; uvicorn's own loggers do not propagate here.
logging.basicConfig(level=logging.INFO, format="%(levelname)s %(name)s: %(message)s")


@asynccontextmanager
async def lifespan(_: FastAPI):
    # Off the request path: the server takes traffic while the LLM client warms up.
    threading.Thread(target=warmup, name="llm-warmup", daemon=True).start()
    yield


def create_app() -> FastAPI:
    settings = get_settings()
    app = FastAPI(title="Takomo Fitter API", version=__version__, lifespan=lifespan)
    app.add_middleware(
        CORSMiddleware,
        allow_origins=settings.cors_origin_list,
        allow_methods=["GET", "POST", "PUT"],
        allow_headers=["*"],
        expose_headers=["X-Cache"],
    )
    limiter = RateLimiter(settings.explain_rate_per_min)
    chat_limiter = RateLimiter(settings.chat_rate_per_min)
    swing_limiter = RateLimiter(settings.swing_rate_per_min)
    # Voice (TTS) is a self-contained module: TAKOMO_TTS_PROVIDER=none leaves no route and no token behind.
    voice_on = voice.enabled()
    if voice_on:
        app.include_router(voice.build_router())

    @app.middleware("http")
    async def body_cap(request: Request, call_next):
        if request.method in ("POST", "PUT"):
            cap = settings.swing_max_body_bytes if request.url.path == "/v1/swing/analyze" else settings.max_body_bytes
            n = request.headers.get("content-length")
            if n is None or not n.isdigit():
                body = await request.body()  # chunked: read and measure
                if len(body) > cap:
                    return JSONResponse({"detail": "body too large"}, status_code=413)
            elif int(n) > cap:
                return JSONResponse({"detail": "body too large"}, status_code=413)
        return await call_next(request)

    @app.get("/health")
    def health() -> dict:
        return {"status": "ok", "version": __version__, "schema_version": SCHEMA_VERSION, "env": settings.env}

    @app.post("/v1/fit", response_model=FitState)
    def fit(req: FitRequest) -> FitState:
        """Run the engine for the current step. Cheap + deterministic: call after every step."""
        return engine.run(req)

    @app.post("/v1/swing/analyze", response_model=SwingAnalysis)
    def swing_analyze(req: SwingAnalyzeRequest, request: Request) -> SwingAnalysis:
        """main's swing algorithm on pose keypoints from the device (no video). Returns measurements only;
        the device adds them to the next /v1/fit request. Nothing is stored or logged."""
        if not swing_limiter.allow(client_key(request)):
            raise HTTPException(429, "too many swing analyses, slow down")
        return analyze_swing(req)

    class ExplainRequest(BaseModel):
        """Inputs, not a fit state: the server re-runs the engine so every label the LLM sees is its own."""

        request: FitRequest
        previous_request: FitRequest | None = None
        role: Role = "step_line"

    @app.post("/v1/explain", response_model=Explanation)
    def explain_fit(req: ExplainRequest, request: Request) -> Explanation:
        """Host lines for the current fit. Never fails: falls back to reason-code templates."""
        if not limiter.allow(client_key(request)):
            raise HTTPException(429, "too many explain calls, slow down")
        prev = None
        if req.previous_request is not None:
            prev = engine.run(req.previous_request.model_copy(update={"previous": None}))
        state = engine.run(req.request.model_copy(update={"previous": prev}))
        out = explain(state, req.role)
        if voice_on:
            out.audio_token = voice.audio_token(out.spoken_line)
        return out

    @app.post("/v1/chat", response_model=ChatReply)
    def chat_turn(req: ChatRequest, request: Request) -> ChatReply:
        """One profiling chat turn with the host. Never fails: falls back to scripted replies."""
        if not chat_limiter.allow(client_key(request)):
            raise HTTPException(429, "too many chat calls, slow down")
        out = chat(req)
        if voice_on and speakable(out):
            out.audio_token = voice.audio_token(out.reply)
        return out

    class RoleSetting(BaseModel):
        provider: str
        model: str

    @app.get("/v1/settings")
    def get_llm_settings() -> dict:
        return registry.snapshot() | {"demo_mode": settings.demo_mode, "voice": voice.status()}

    @app.put("/v1/settings")
    def put_llm_settings(roles: dict[str, RoleSetting], x_demo_token: str | None = Header(default=None)) -> dict:
        """Runtime provider/model switch for the demo panel. Needs TAKOMO_DEMO_MODE=true + X-Demo-Token."""
        if not settings.demo_mode or not settings.demo_token:
            raise HTTPException(403, "settings are read-only outside demo mode")
        if not x_demo_token or not hmac.compare_digest(x_demo_token, settings.demo_token):
            raise HTTPException(403, "bad demo token")
        for cfg in roles.values():
            if cfg.model not in settings.model_allowlist:
                raise HTTPException(422, f"model not allowed: {cfg.model}")
        try:
            for role, cfg in roles.items():
                registry.set_role(role, registry.RoleConfig(cfg.provider, cfg.model))
        except ValueError as e:
            raise HTTPException(422, str(e)) from e
        return registry.snapshot() | {"demo_mode": settings.demo_mode}

    return app


app = create_app()
