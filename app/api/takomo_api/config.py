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

    @property
    def cors_origin_list(self) -> list[str]:
        return [o.strip() for o in self.cors_origins.split(",") if o.strip()]


@lru_cache
def get_settings() -> Settings:
    return Settings()
