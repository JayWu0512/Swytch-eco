from pydantic_settings import BaseSettings


class Settings(BaseSettings):
    APP_NAME: str = "swytch-eco-backend"

    # CORS
    CORS_ALLOW_ORIGINS: list[str] = ["*"]

    # OpenAI
    OPENAI_API_KEY: str | None = None
    OPENAI_MODEL: str = "gpt-4o-mini"

    # Climatiq
    CLIMATIQ_API_KEY: str | None = None
    CLIMATIQ_BASE_URL: str = "https://api.climatiq.io"

    # Optional: SerpAPI for quick alternative URL search
    SERPAPI_KEY: str | None = None

    # Debug
    RETURN_DEBUG: bool = True

    class Config:
        env_file = ".env"
        extra = "ignore"


settings = Settings()
