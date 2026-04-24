"""move suspension settings to four-corner fields

Revision ID: 0004_sm2_susp_adj
Revises: 0002_sm2_racing_schema
Create Date: 2026-04-21 00:00:00.000000
"""

from __future__ import annotations

from alembic import op


# revision identifiers, used by Alembic.
revision = "0004_sm2_susp_adj"
down_revision = "0002_sm2_racing_schema"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.execute(
        """
        ALTER TABLE sm2.suspensions
            ADD COLUMN rebound_fl smallint,
            ADD COLUMN rebound_fr smallint,
            ADD COLUMN rebound_rl smallint,
            ADD COLUMN rebound_rr smallint,
            ADD COLUMN bump_fl smallint,
            ADD COLUMN bump_fr smallint,
            ADD COLUMN bump_rl smallint,
            ADD COLUMN bump_rr smallint;
        """
    )

    op.execute(
        """
        UPDATE sm2.suspensions
        SET rebound_fl = rebound_f,
            rebound_fr = rebound_f,
            rebound_rl = rebound_r,
            rebound_rr = rebound_r,
            bump_fl = bump_f,
            bump_fr = bump_f,
            bump_rl = bump_r,
            bump_rr = bump_r
        WHERE rebound_f IS NOT NULL
           OR rebound_r IS NOT NULL
           OR bump_f IS NOT NULL
           OR bump_r IS NOT NULL;
        """
    )

    op.execute(
        """
        ALTER TABLE sm2.suspensions
            ADD CONSTRAINT suspensions_rebound_fl_check CHECK (rebound_fl IS NULL OR rebound_fl >= 0),
            ADD CONSTRAINT suspensions_rebound_fr_check CHECK (rebound_fr IS NULL OR rebound_fr >= 0),
            ADD CONSTRAINT suspensions_rebound_rl_check CHECK (rebound_rl IS NULL OR rebound_rl >= 0),
            ADD CONSTRAINT suspensions_rebound_rr_check CHECK (rebound_rr IS NULL OR rebound_rr >= 0),
            ADD CONSTRAINT suspensions_bump_fl_check CHECK (bump_fl IS NULL OR bump_fl >= 0),
            ADD CONSTRAINT suspensions_bump_fr_check CHECK (bump_fr IS NULL OR bump_fr >= 0),
            ADD CONSTRAINT suspensions_bump_rl_check CHECK (bump_rl IS NULL OR bump_rl >= 0),
            ADD CONSTRAINT suspensions_bump_rr_check CHECK (bump_rr IS NULL OR bump_rr >= 0);
        """
    )

    op.execute(
        """
        ALTER TABLE sm2.suspensions
            DROP COLUMN rebound_f,
            DROP COLUMN rebound_r,
            DROP COLUMN bump_f,
            DROP COLUMN bump_r;
        """
    )


def downgrade() -> None:
    op.execute(
        """
        ALTER TABLE sm2.suspensions
            ADD COLUMN rebound_f smallint,
            ADD COLUMN rebound_r smallint,
            ADD COLUMN bump_f smallint,
            ADD COLUMN bump_r smallint;
        """
    )

    op.execute(
        """
        UPDATE sm2.suspensions
        SET rebound_f = CASE
                WHEN rebound_fl IS NULL AND rebound_fr IS NULL THEN NULL
                WHEN rebound_fl IS NULL THEN rebound_fr
                WHEN rebound_fr IS NULL THEN rebound_fl
                ELSE ROUND(((rebound_fl::numeric + rebound_fr::numeric) / 2.0), 0)::smallint
            END,
            rebound_r = CASE
                WHEN rebound_rl IS NULL AND rebound_rr IS NULL THEN NULL
                WHEN rebound_rl IS NULL THEN rebound_rr
                WHEN rebound_rr IS NULL THEN rebound_rl
                ELSE ROUND(((rebound_rl::numeric + rebound_rr::numeric) / 2.0), 0)::smallint
            END,
            bump_f = CASE
                WHEN bump_fl IS NULL AND bump_fr IS NULL THEN NULL
                WHEN bump_fl IS NULL THEN bump_fr
                WHEN bump_fr IS NULL THEN bump_fl
                ELSE ROUND(((bump_fl::numeric + bump_fr::numeric) / 2.0), 0)::smallint
            END,
            bump_r = CASE
                WHEN bump_rl IS NULL AND bump_rr IS NULL THEN NULL
                WHEN bump_rl IS NULL THEN bump_rr
                WHEN bump_rr IS NULL THEN bump_rl
                ELSE ROUND(((bump_rl::numeric + bump_rr::numeric) / 2.0), 0)::smallint
            END;
        """
    )

    op.execute(
        """
        ALTER TABLE sm2.suspensions
            ADD CONSTRAINT suspensions_rebound_f_check CHECK (rebound_f IS NULL OR rebound_f >= 0),
            ADD CONSTRAINT suspensions_rebound_r_check CHECK (rebound_r IS NULL OR rebound_r >= 0),
            ADD CONSTRAINT suspensions_bump_f_check CHECK (bump_f IS NULL OR bump_f >= 0),
            ADD CONSTRAINT suspensions_bump_r_check CHECK (bump_r IS NULL OR bump_r >= 0);
        """
    )

    op.execute(
        """
        ALTER TABLE sm2.suspensions
            DROP COLUMN rebound_fl,
            DROP COLUMN rebound_fr,
            DROP COLUMN rebound_rl,
            DROP COLUMN rebound_rr,
            DROP COLUMN bump_fl,
            DROP COLUMN bump_fr,
            DROP COLUMN bump_rl,
            DROP COLUMN bump_rr;
        """
    )
