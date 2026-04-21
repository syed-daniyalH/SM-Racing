import uuid

from sqlalchemy import create_engine, event
from sqlalchemy.orm import DeclarativeBase, Mapped, Session, mapped_column, sessionmaker

from app.core.config import get_settings


settings = get_settings()
_engine = None
_session_local = None


class Base(DeclarativeBase):
    pass


class UUIDMixin:
    id: Mapped[uuid.UUID] = mapped_column(primary_key=True, default=uuid.uuid4)


def get_database_schema() -> str:
    schema = (settings.database_schema or "").strip()
    if schema and not schema.replace("_", "").isalnum():
        raise ValueError("DATABASE_SCHEMA must contain only letters, numbers, and underscores")
    return schema


def _quote_identifier(identifier: str) -> str:
    return '"' + identifier.replace('"', '""') + '"'


def _set_search_path(dbapi_connection, _connection_record) -> None:
    schema = get_database_schema()
    if not schema or schema == "public":
        return

    with dbapi_connection.cursor() as cursor:
        cursor.execute(f"SET search_path TO {_quote_identifier(schema)}, public")


def get_engine():
    global _engine
    if _engine is None:
        _engine = create_engine(settings.database_url, pool_pre_ping=True)
        event.listen(_engine, "connect", _set_search_path)
    return _engine


def get_session_local():
    global _session_local
    if _session_local is None:
        _session_local = sessionmaker(autocommit=False, autoflush=False, bind=get_engine())
    return _session_local


def get_db():
    db: Session = get_session_local()()
    try:
        yield db
    finally:
        db.close()
