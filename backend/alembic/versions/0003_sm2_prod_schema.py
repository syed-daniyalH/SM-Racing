"""production schema marker

Revision ID: 0003_sm2_prod_schema
Revises: 0002_sm2_racing_schema
Create Date: 2026-04-21 00:00:00.000000
"""

from __future__ import annotations


# revision identifiers, used by Alembic.
revision = "0003_sm2_prod_schema"
down_revision = "0002_sm2_racing_schema"
branch_labels = None
depends_on = None


def upgrade() -> None:
    # This revision intentionally carries no schema changes.
    #
    # The live Neon database is already stamped at 0003_sm2_prod_schema.
    # Keeping this file in the tree lets Alembic resolve the deployed
    # version and keeps fresh environments aligned with the same migration
    # chain.
    pass


def downgrade() -> None:
    pass
