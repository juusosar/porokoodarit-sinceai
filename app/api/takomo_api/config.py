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
    llm_timeout_s: float = 6.0
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
    # Abuse limits for /v1/explain (per API instance, in memory).
    explain_rate_per_min: int = 30
    max_body_bytes: int = 64_000

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
