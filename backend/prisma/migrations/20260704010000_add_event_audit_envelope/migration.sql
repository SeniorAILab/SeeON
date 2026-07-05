ALTER TABLE events ADD COLUMN config_version INTEGER;
ALTER TABLE events ADD COLUMN model_version TEXT;
ALTER TABLE events ADD COLUMN detector_version TEXT;
ALTER TABLE events ADD COLUMN operating_threshold DOUBLE PRECISION;
ALTER TABLE events ADD COLUMN snapshot_key TEXT;
ALTER TABLE events ADD COLUMN clock_source TEXT;
