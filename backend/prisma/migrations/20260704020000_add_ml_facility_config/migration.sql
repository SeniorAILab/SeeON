-- ML facility config SSOT (Plane-P). Non-RLS; facility-scoped by explicit id.
CREATE TABLE ml_facility_config (
  facility_id    TEXT PRIMARY KEY,
  config_version INTEGER NOT NULL DEFAULT 0,
  night_start    TEXT NOT NULL DEFAULT '21:00',
  night_end      TEXT NOT NULL DEFAULT '07:00',
  tz             TEXT NOT NULL DEFAULT 'Asia/Seoul',
  updated_at     TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT ml_facility_config_facility_id_fkey FOREIGN KEY (facility_id) REFERENCES facilities(id) ON DELETE RESTRICT ON UPDATE CASCADE
);
GRANT SELECT, INSERT, UPDATE, DELETE ON ml_facility_config TO fall_app;
