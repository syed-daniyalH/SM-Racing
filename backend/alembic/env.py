from logging.config import fileConfig

from alembic import context
from sqlalchemy import engine_from_config, pool

from app.core.config import get_settings
from app.core.database import Base

import app.models  # noqa: F401 - ensure model metadata is registered


config = context.config

if config.config_file_name is not None:
    fileConfig(config.config_file_name)

settings = get_settings()
config.set_main_option("sqlalchemy.url", settings.database_url)

target_metadata = Base.metadata


def run_migrations_offline() -> None:
    context.configure(
        url=settings.database_url,
        target_metadata=target_metadata,
        literal_binds=True,
        dialect_opts={"paramstyle": "named"},
    )

    with context.begin_transaction():
        context.run_migrations()


def run_migrations_online() -> None:
    connectable = engine_from_config(
        {"sqlalchemy.url": settings.database_url},
        prefix="sqlalchemy.",
        poolclass=pool.NullPool,
    )

    with connectable.connect() as connection:
        schema = (settings.database_schema or "").strip()
        if schema and schema != "public":
            if not schema.replace("_", "").isalnum():
                raise ValueError("DATABASE_SCHEMA must contain only letters, numbers, and underscores")

            quoted_schema = f'"{schema}"'
            connection.exec_driver_sql(f"CREATE SCHEMA IF NOT EXISTS {quoted_schema}")
            connection.exec_driver_sql(f"SET search_path TO {quoted_schema}, public")

        context.configure(
            connection=connection,
            target_metadata=target_metadata,
        )

        with context.begin_transaction():
            context.run_migrations()


if context.is_offline_mode():
    run_migrations_offline()
else:
    run_migrations_online()
