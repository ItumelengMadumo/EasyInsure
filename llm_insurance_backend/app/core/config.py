import os
from dotenv import load_dotenv

load_dotenv()


class Settings:
    ENVIRONMENT = os.getenv("ENVIRONMENT", "development")

    # White-label branding
    COMPANY_NAME = os.getenv("COMPANY_NAME", "EasyInsure")

    # LLM API Keys
    OPENAI_API_KEY = os.getenv("OPENAI_API_KEY", "")

    # JWT Secret Key
    SECRET_KEY = os.getenv("SECRET_KEY", "dev-secret-change-in-production")
    ALGORITHM = "HS256"
    ACCESS_TOKEN_EXPIRE_MINUTES = 30

    # Database — DATABASE_URL (works with any managed Postgres) takes priority
    # over the discrete DB_* vars, which remain as a fallback.
    DATABASE_URL = os.getenv("DATABASE_URL", "")
    DATABASE_CONFIG = {
        "dbname": os.getenv("DB_NAME", "Insurance_llm"),
        "user": os.getenv("DB_USER", "postgres"),
        "password": os.getenv("DB_PASSWORD", ""),
        "host": os.getenv("DB_HOST", "localhost"),
        "port": os.getenv("DB_PORT", "5433"),
    }

    DEV_MODE = os.getenv("DEV_MODE", "false").lower() == "true"

    CORS_ORIGINS = [
        origin.strip()
        for origin in os.getenv("CORS_ORIGINS", "http://localhost:3000,http://localhost:5173").split(",")
        if origin.strip()
    ]

    @property
    def is_production(self) -> bool:
        return self.ENVIRONMENT.lower() == "production"

    def validate(self):
        """Fail fast on unsafe configuration instead of booting into an insecure state."""
        errors = []

        if len(self.SECRET_KEY) < 32 or self.SECRET_KEY == "dev-secret-change-in-production":
            errors.append(
                "SECRET_KEY is missing or too short. Set a random value with 32+ characters "
                "(e.g. `openssl rand -base64 48`)."
            )

        if "*" in self.CORS_ORIGINS:
            errors.append(
                "CORS_ORIGINS cannot contain '*'. List explicit allowed origins, comma-separated."
            )

        if self.is_production:
            if self.DEV_MODE:
                errors.append(
                    "DEV_MODE=true is not allowed when ENVIRONMENT=production — it bypasses ALL authentication."
                )
            if not self.DATABASE_URL and not self.DATABASE_CONFIG["password"]:
                errors.append("Database password is empty in production.")

        if errors:
            raise RuntimeError(
                "Refusing to start due to configuration error(s):\n- " + "\n- ".join(errors)
            )


settings = Settings()
