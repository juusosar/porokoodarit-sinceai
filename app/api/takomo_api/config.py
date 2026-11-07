"""Runtime settings. Values come from env vars (prefix TAKOMO_) or a local .env file."""

from functools import lru_cache

from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_prefix="TAKOMO_", env_file=".env", extra="ignore")

    env: str = "local"
    # Comma-separated list of origins allowed to call the API (web app, Shopify page).
    cors_origins: str = "http://localhost:5173"
    # Demo mode unlocks runtime settings overrides (provider switch panel). Never on in prod.
    demo_mode: bool = False
    # Required header X-Demo-Token for PUT /v1/settings (demo mode only). Unset = settings locked.
    demo_token: str | None = None

    # LLM (POR-16). Provider-agnostic; "template" = no LLM, reason-code templates only.
    llm_provider: str = "gemini"
    llm_model_step: str = "gemini-flash-latest"
    llm_model_final: str = "gemini-pro-latest"
    # Per role (POR-25): step lines are short + frequent -> minimal thinking, tight timeout.
    # The final walkthrough is once per fitting and longer -> low thinking, more time.
    # Gemini 3+ "thinking" adds seconds per call; "" = model default. Gemini 2.x rejects levels: use "".
    # Gemini 3 Pro accepts only low/high.
    llm_timeout_s: float = 6.0  # step_line
    llm_timeout_s_final: float = 12.0
    llm_thinking_level_step: str = "minimal"
    llm_thinking_level_final: str = "low"
    # /v1/chat: whole conversation in the prompt -> bigger input; keep thinking minimal so replies stay fast.
    llm_timeout_s_chat: float = 12.0
    llm_thinking_level_chat: str = "minimal"
    gemini_api_key: str | None = None
    # Keyless alternative: Vertex AI via Application Default Credentials (Cloud Run service account,
    # or `gcloud auth application-default login` locally). Takes precedence over the API key.
    gemini_vertex: bool = False
    gcp_project: str | None = None
    gcp_location: str = "global"
    # Models the demo panel may switch to (comma-separated). Env-configured role models are always allowed.
    llm_model_allowlist: str = (
        "gemini-flash-latest,gemini-flash-lite-latest,gemini-pro-latest,gemini-3.8-flash,gemini-3.5-flash-lite"
    )
    # Voice (TTS) for host lines. "none" = off: no /v1/speak route; the web app falls back to the browser voice.
    tts_provider: str = "none"
    elevenlabs_api_key: str | None = None
    # Stock premade voice (not a clone of a real person). Change via env, no code change.
    elevenlabs_voice_id: str = "JBFqnCBsd6RMkjVDRZzb"
    elevenlabs_model: str = "eleven_flash_v2_5"
    tts_rate_per_min: int = 30
    # Spend cap: characters sent to the provider per UTC day per instance (cache hits are free).
    tts_daily_chars: int = 20_000
    tts_cache_mb: int = 32
    # Abuse limits for /v1/explain (per API instance, in memory).
    explain_rate_per_min: int = 30
    # Host chat: ~8 turns per fitting; a demo venue shares one IP, so allow more.
    chat_rate_per_min: int = 120
    max_body_bytes: int = 64_000

    @property
    def llm_thinking_level(self) -> str:
        """Back-compat for callers written before per-role levels (e.g. /v1/chat): final level."""
        return self.llm_thinking_level_final

    def llm_limits(self, role: str) -> tuple[float, str]:
        """(timeout_s, thinking_level) for an LLM role (step_line, final_walkthrough, chat)."""
        if role == "step_line":
            return self.llm_timeout_s, self.llm_thinking_level_step
        if role == "chat":
            return self.llm_timeout_s_chat, self.llm_thinking_level_chat
        return self.llm_timeout_s_final, self.llm_thinking_level_final

    @property
    def model_allowlist(self) -> set[str]:
        return {m.strip() for m in self.llm_model_allowlist.split(",") if m.strip()} | {
            self.llm_model_step,
            self.llm_model_final,
            "-",
        }

    @property
    def cors_origin_list(self) -> list[str]:
        return [o.strip() for o in self.cors_origins.split(",") if o.strip()]


@lru_cache
def get_settings() -> Settings:
    return Settings()
