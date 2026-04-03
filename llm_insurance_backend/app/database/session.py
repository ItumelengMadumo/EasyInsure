from sqlalchemy import create_engine
from sqlalchemy.ext.declarative import declarative_base
from sqlalchemy.orm import sessionmaker
from app.core.config import settings
import os

if settings.DEV_MODE:
    # Use SQLite for development when PostgreSQL is unavailable
    DB_PATH = os.path.join(os.path.dirname(os.path.dirname(os.path.dirname(__file__))), "easyinsure_dev.db")
    DATABASE_URL = f"sqlite:///{DB_PATH}"
    engine = create_engine(DATABASE_URL, connect_args={"check_same_thread": False})
else:
    DATABASE_URL = (
        f"postgresql://{settings.DATABASE_CONFIG['user']}:"
        f"{settings.DATABASE_CONFIG['password']}@"
        f"{settings.DATABASE_CONFIG['host']}:"
        f"{settings.DATABASE_CONFIG['port']}/"
        f"{settings.DATABASE_CONFIG['dbname']}"
    )
    engine = create_engine(DATABASE_URL, pool_pre_ping=True)

SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)
Base = declarative_base()


def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()
