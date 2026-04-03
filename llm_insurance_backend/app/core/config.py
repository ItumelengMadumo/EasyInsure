import os
from dotenv import load_dotenv

load_dotenv()


class Settings:
    # LLM API Keys
    OPENAI_API_KEY = os.getenv("OPENAI_API_KEY", "")

    # JWT Secret Key
    SECRET_KEY = os.getenv("SECRET_KEY", "dev-secret-change-in-production")
    ALGORITHM = "HS256"
    ACCESS_TOKEN_EXPIRE_MINUTES = 30

    # Database Configuration
    DATABASE_CONFIG = {
        "dbname": os.getenv("DB_NAME", "Insurance_llm"),
        "user": os.getenv("DB_USER", "postgres"),
        "password": os.getenv("DB_PASSWORD", "admin"),
        "host": os.getenv("DB_HOST", "localhost"),
        "port": os.getenv("DB_PORT", "5433"),
    }

    DEV_MODE = os.getenv("DEV_MODE", "false").lower() == "true"


settings = Settings()
