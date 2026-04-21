"""consolidate runtime tables into sm schema

Revision ID: 0005_use_sm_schema
Revises: 0004_sm2_susp_adj
Create Date: 2026-04-21 00:00:00.000000
"""

from __future__ import annotations

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision = "0005_use_sm_schema"
down_revision = "0004_sm2_susp_adj"
branch_labels = None
depends_on = None


APP_TABLES = (
    "alembic_version",
    "users",
    "events",
    "drivers",
    "vehicles",
    "run_groups",
    "submissions",
    "revoked_tokens",
)

APP_ENUM_TYPES = (
    "user_role",
    "run_group_code",
    "submission_status",
)


def _quote(identifier: str) -> str:
    return '"' + identifier.replace('"', '""') + '"'


def _table_exists(bind, schema: str, table: str) -> bool:
    return bool(
        bind.execute(
            sa.text(
                """
                SELECT EXISTS (
                    SELECT 1
                    FROM information_schema.tables
                    WHERE table_schema = :schema
                      AND table_name = :table
                      AND table_type = 'BASE TABLE'
                )
                """
            ),
            {"schema": schema, "table": table},
        ).scalar()
    )


def _type_exists(bind, schema: str, type_name: str) -> bool:
    return bool(
        bind.execute(
            sa.text(
                """
                SELECT EXISTS (
                    SELECT 1
                    FROM pg_type t
                    JOIN pg_namespace n ON n.oid = t.typnamespace
                    WHERE n.nspname = :schema
                      AND t.typname = :type_name
                )
                """
            ),
            {"schema": schema, "type_name": type_name},
        ).scalar()
    )


def _row_count(bind, schema: str, table: str) -> int:
    return int(
        bind.exec_driver_sql(
            f"SELECT count(*) FROM {_quote(schema)}.{_quote(table)}"
        ).scalar()
    )


def _move_table_to_sm(bind, table: str) -> None:
    public_exists = _table_exists(bind, "public", table)
    sm_exists = _table_exists(bind, "sm", table)

    if public_exists and sm_exists:
        public_count = _row_count(bind, "public", table)
        sm_count = _row_count(bind, "sm", table)

        if public_count == 0:
            bind.exec_driver_sql(f"DROP TABLE public.{_quote(table)} CASCADE")
            return

        if sm_count == 0:
            bind.exec_driver_sql(f"DROP TABLE sm.{_quote(table)} CASCADE")
            bind.exec_driver_sql(f"ALTER TABLE public.{_quote(table)} SET SCHEMA sm")
            return

        raise RuntimeError(
            f"Both public.{table} and sm.{table} contain rows. "
            "Refusing to consolidate automatically."
        )

    if public_exists:
        bind.exec_driver_sql(f"ALTER TABLE public.{_quote(table)} SET SCHEMA sm")


def _move_enum_to_sm(bind, type_name: str) -> None:
    public_exists = _type_exists(bind, "public", type_name)
    sm_exists = _type_exists(bind, "sm", type_name)

    if public_exists and not sm_exists:
        bind.exec_driver_sql(f"ALTER TYPE public.{_quote(type_name)} SET SCHEMA sm")


def _drop_sm2_if_empty(bind) -> None:
    sm2_exists = bool(
        bind.execute(
            sa.text(
                """
                SELECT EXISTS (
                    SELECT 1
                    FROM information_schema.schemata
                    WHERE schema_name = 'sm2'
                )
                """
            )
        ).scalar()
    )
    if not sm2_exists:
        return

    tables = bind.execute(
        sa.text(
            """
            SELECT table_name
            FROM information_schema.tables
            WHERE table_schema = 'sm2'
              AND table_type = 'BASE TABLE'
            ORDER BY table_name
            """
        )
    ).scalars()

    non_empty_tables: list[str] = []
    for table in tables:
        if _row_count(bind, "sm2", table) > 0:
            non_empty_tables.append(table)

    if non_empty_tables:
        raise RuntimeError(
            "sm2 schema contains data and will not be dropped automatically: "
            + ", ".join(non_empty_tables)
        )

    bind.exec_driver_sql("DROP SCHEMA IF EXISTS sm2 CASCADE")


def upgrade() -> None:
    bind = op.get_bind()
    bind.exec_driver_sql("CREATE SCHEMA IF NOT EXISTS sm")
    bind.exec_driver_sql("SET search_path TO sm, public")

    for table in APP_TABLES:
        _move_table_to_sm(bind, table)

    for type_name in APP_ENUM_TYPES:
        _move_enum_to_sm(bind, type_name)

    _drop_sm2_if_empty(bind)


def downgrade() -> None:
    # This consolidation intentionally does not move production data back to
    # public automatically. Restore from backup if a rollback is required.
    pass
