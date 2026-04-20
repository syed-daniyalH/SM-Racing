-- SM2 Racing Neon/Postgres schema
-- Source mapping: uploaded workbook tabs + v2.6.1 spec

-- Optional: create enums
DO $$ BEGIN
    CREATE TYPE sm2_status AS ENUM ('ACTIVE', 'ARCHIVED');
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
    CREATE TYPE sm2_log_status AS ENUM ('SUCCESS', 'ERROR', 'VALIDATION_FAILED');
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
    CREATE TYPE sm2_tire_inventory_status AS ENUM ('ACTIVE', 'DISCARDED');
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

-- 1) Reference tables
CREATE TABLE IF NOT EXISTS drivers (
    driver_id      text PRIMARY KEY,
    driver_name    text NOT NULL,
    aliases        text,
    active         boolean NOT NULL DEFAULT true,
    created_at     timestamptz NOT NULL DEFAULT now(),
    updated_at     timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS vehicles (
    vehicle_id     text PRIMARY KEY,
    driver_id      text NOT NULL REFERENCES drivers(driver_id) ON UPDATE CASCADE,
    make           text NOT NULL,
    model          text NOT NULL,
    year           integer CHECK (year BETWEEN 1900 AND 2100),
    class          text,
    notes          text,
    active         boolean NOT NULL DEFAULT true,
    created_at     timestamptz NOT NULL DEFAULT now(),
    updated_at     timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_vehicles_driver_id ON vehicles(driver_id);

CREATE TABLE IF NOT EXISTS tracks (
    name           text PRIMARY KEY,
    latitude       numeric(9,6),
    longitude      numeric(9,6),
    country        text,
    active         boolean NOT NULL DEFAULT true,
    created_at     timestamptz NOT NULL DEFAULT now(),
    updated_at     timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS tire_inventory (
    tire_id             text PRIMARY KEY CHECK (tire_id ~ '^[YMP]-S[0-9]+$'),
    manufacturer        text NOT NULL,
    model               text,
    size                text,
    purchase_date       date,
    heat_cycles         integer CHECK (heat_cycles IS NULL OR heat_cycles >= 0),
    track_time_min      integer CHECK (track_time_min IS NULL OR track_time_min >= 0),
    status              sm2_tire_inventory_status NOT NULL DEFAULT 'ACTIVE',
    created_at          timestamptz NOT NULL DEFAULT now(),
    updated_at          timestamptz NOT NULL DEFAULT now()
);

-- 2) Main session table (SEANCES)
CREATE TABLE IF NOT EXISTS seances (
    id_seance           text PRIMARY KEY,
    session_date        date NOT NULL,
    session_time        time,
    track               text NOT NULL REFERENCES tracks(name) ON UPDATE CASCADE,
    driver_id           text NOT NULL REFERENCES drivers(driver_id) ON UPDATE CASCADE,
    vehicle_id          text NOT NULL REFERENCES vehicles(vehicle_id) ON UPDATE CASCADE,
    session_type        text,
    session_number      integer NOT NULL CHECK (session_number > 0),
    duration_min        integer CHECK (duration_min IS NULL OR duration_min > 0),
    tire_set            text CHECK (tire_set IS NULL OR tire_set ~ '^[YMP]-S[0-9]+$'),
    notes               text,
    created_by          text NOT NULL,
    created_at          timestamptz NOT NULL DEFAULT now(),
    status              sm2_status NOT NULL DEFAULT 'ACTIVE',
    CONSTRAINT fk_seances_tire_set FOREIGN KEY (tire_set) REFERENCES tire_inventory(tire_id) ON UPDATE CASCADE,
    CONSTRAINT uq_session_identity UNIQUE (session_date, session_time, track, driver_id, vehicle_id, session_type, session_number)
);

CREATE INDEX IF NOT EXISTS idx_seances_driver_id   ON seances(driver_id);
CREATE INDEX IF NOT EXISTS idx_seances_vehicle_id  ON seances(vehicle_id);
CREATE INDEX IF NOT EXISTS idx_seances_track       ON seances(track);
CREATE INDEX IF NOT EXISTS idx_seances_date        ON seances(session_date);
CREATE INDEX IF NOT EXISTS idx_seances_created_at  ON seances(created_at);

-- 3) Session detail tables
CREATE TABLE IF NOT EXISTS pressures (
    id_seance           text PRIMARY KEY REFERENCES seances(id_seance) ON DELETE CASCADE,
    cold_fl             numeric(6,2) CHECK (cold_fl IS NULL OR cold_fl BETWEEN 5 AND 60),
    cold_fr             numeric(6,2) CHECK (cold_fr IS NULL OR cold_fr BETWEEN 5 AND 60),
    cold_rl             numeric(6,2) CHECK (cold_rl IS NULL OR cold_rl BETWEEN 5 AND 60),
    cold_rr             numeric(6,2) CHECK (cold_rr IS NULL OR cold_rr BETWEEN 5 AND 60),
    hot_fl              numeric(6,2) CHECK (hot_fl IS NULL OR hot_fl BETWEEN 5 AND 80),
    hot_fr              numeric(6,2) CHECK (hot_fr IS NULL OR hot_fr BETWEEN 5 AND 80),
    hot_rl              numeric(6,2) CHECK (hot_rl IS NULL OR hot_rl BETWEEN 5 AND 80),
    hot_rr              numeric(6,2) CHECK (hot_rr IS NULL OR hot_rr BETWEEN 5 AND 80)
);

CREATE TABLE IF NOT EXISTS suspensions (
    id_seance           text PRIMARY KEY REFERENCES seances(id_seance) ON DELETE CASCADE,
    rebound_f           integer,
    rebound_r           integer,
    bump_f              integer,
    bump_r              integer,
    sway_bar_f          text,
    sway_bar_r          text,
    wing_angle_deg      numeric(6,2)
);

CREATE TABLE IF NOT EXISTS alignment (
    id_seance           text PRIMARY KEY REFERENCES seances(id_seance) ON DELETE CASCADE,
    camber_fl           numeric(6,2),
    camber_fr           numeric(6,2),
    camber_rl           numeric(6,2),
    camber_rr           numeric(6,2),
    toe_front           text,
    toe_rear            text,
    caster_l            numeric(6,2),
    caster_r            numeric(6,2),
    ride_height_f       numeric(8,2),
    ride_height_r       numeric(8,2),
    corner_weight_fl    numeric(8,2),
    corner_weight_fr    numeric(8,2),
    corner_weight_rl    numeric(8,2),
    corner_weight_rr    numeric(8,2),
    cross_weight_pct    numeric(6,2),
    rake_mm             numeric(8,2),
    wheelbase_mm        numeric(8,2)
);

CREATE TABLE IF NOT EXISTS tire_temperatures (
    id_seance           text PRIMARY KEY REFERENCES seances(id_seance) ON DELETE CASCADE,
    fl_in               numeric(6,2),
    fl_mid              numeric(6,2),
    fl_out              numeric(6,2),
    fr_in               numeric(6,2),
    fr_mid              numeric(6,2),
    fr_out              numeric(6,2),
    rl_in               numeric(6,2),
    rl_mid              numeric(6,2),
    rl_out              numeric(6,2),
    rr_in               numeric(6,2),
    rr_mid              numeric(6,2),
    rr_out              numeric(6,2),
    photo_url           text
);

CREATE TABLE IF NOT EXISTS tire_history (
    tire_id             text NOT NULL REFERENCES tire_inventory(tire_id) ON UPDATE CASCADE,
    id_seance           text NOT NULL REFERENCES seances(id_seance) ON DELETE CASCADE,
    usage_date          date,
    track               text REFERENCES tracks(name) ON UPDATE CASCADE,
    duration_min        integer CHECK (duration_min IS NULL OR duration_min >= 0),
    created_at          timestamptz NOT NULL DEFAULT now(),
    PRIMARY KEY (tire_id, id_seance)
);

CREATE INDEX IF NOT EXISTS idx_tire_history_seance ON tire_history(id_seance);

-- 4) Logs / audit
CREATE TABLE IF NOT EXISTS logs (
    log_id              bigserial PRIMARY KEY,
    logged_at           timestamptz NOT NULL DEFAULT now(),
    action              text NOT NULL,
    status              sm2_log_status NOT NULL,
    message             text,
    payload             jsonb,
    "user"             text
);

CREATE INDEX IF NOT EXISTS idx_logs_logged_at ON logs(logged_at DESC);
CREATE INDEX IF NOT EXISTS idx_logs_status    ON logs(status);
CREATE INDEX IF NOT EXISTS idx_logs_action    ON logs(action);

-- 5) Recommended raw/OCR tables for Phase 2
CREATE TABLE IF NOT EXISTS submission_inputs (
    submission_id       bigserial PRIMARY KEY,
    id_seance           text REFERENCES seances(id_seance) ON DELETE SET NULL,
    submission_type     text NOT NULL CHECK (submission_type IN ('quick','detail','ocr','manual','sync')),
    source              text NOT NULL CHECK (source IN ('pwa','make','api','admin','offline_sync','photo')),
    raw_text            text,
    raw_payload_json    jsonb,
    confidence          numeric(4,3) CHECK (confidence IS NULL OR (confidence >= 0 AND confidence <= 1)),
    created_by          text,
    created_at          timestamptz NOT NULL DEFAULT now(),
    validation_status   text CHECK (validation_status IN ('PENDING','VALIDATED','REJECTED','APPLIED')),
    validation_message  text
);

CREATE TABLE IF NOT EXISTS media_files (
    media_id            bigserial PRIMARY KEY,
    submission_id       bigint NOT NULL REFERENCES submission_inputs(submission_id) ON DELETE CASCADE,
    storage_url         text NOT NULL,
    mime_type           text,
    file_name           text,
    file_size           bigint CHECK (file_size IS NULL OR file_size >= 0),
    checksum            text,
    uploaded_by         text,
    uploaded_at         timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS ocr_results (
    ocr_id              bigserial PRIMARY KEY,
    submission_id       bigint NOT NULL REFERENCES submission_inputs(submission_id) ON DELETE CASCADE,
    media_id            bigint REFERENCES media_files(media_id) ON DELETE SET NULL,
    raw_ocr_text        text,
    cleaned_ocr_text    text,
    extracted_json      jsonb,
    ocr_confidence      numeric(4,3) CHECK (ocr_confidence IS NULL OR (ocr_confidence >= 0 AND ocr_confidence <= 1)),
    parser_version      text,
    review_status       text CHECK (review_status IN ('PENDING','APPROVED','REJECTED','CORRECTED')),
    created_at          timestamptz NOT NULL DEFAULT now()
);
