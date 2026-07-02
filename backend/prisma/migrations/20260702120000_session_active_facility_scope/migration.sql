ALTER TABLE "server_sessions"
  ADD COLUMN "active_facility_id" TEXT;

ALTER TABLE "server_sessions"
  ADD CONSTRAINT "server_sessions_active_facility_id_fkey"
  FOREIGN KEY ("active_facility_id")
  REFERENCES "facilities"("id")
  ON DELETE SET NULL
  ON UPDATE CASCADE;

CREATE INDEX "server_sessions_active_facility_id_idx"
  ON "server_sessions"("active_facility_id");
