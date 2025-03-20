import os
from dotenv import load_dotenv

load_dotenv()

class Settings:
    # LLM API Keys
    OPENAI_API_KEY = os.getenv("OPENAI_API_KEY")
    ANTHROPIC_API_KEY = os.getenv("ANTHROPIC_API_KEY")
    COHERE_API_KEY = os.getenv("COHERE_API_KEY")
    
    # Database Configuration
    DATABASE_CONFIG = {
        "dbname": "Insurance_llm",
        "user": "postgres",  # Change if using another username
        "password": "10664",  # Replace with your actual password
        "host": "localhost",
        "port": "5433"
    }

settings = Settings()
