-- Resolve an event's facility before any RLS context exists (snapshot upload boundary).
CREATE OR REPLACE FUNCTION get_event_for_snapshot(p_event_id TEXT)
RETURNS TABLE(id TEXT, facility_id TEXT)
LANGUAGE sql SECURITY DEFINER SET search_path = public, pg_temp
AS $$ SELECT id, facility_id FROM public.events WHERE id = p_event_id LIMIT 1; $$;
REVOKE EXECUTE ON FUNCTION get_event_for_snapshot(TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION get_event_for_snapshot(TEXT) TO fall_app;

-- Narrow snapshot_key backfill: events are append-only for fall_app, so this
-- SECURITY DEFINER setter is the ONLY sanctioned post-insert mutation and touches
-- exactly one column, scoped by (id, facility_id).
CREATE OR REPLACE FUNCTION set_event_snapshot_key(p_event_id TEXT, p_facility_id TEXT, p_snapshot_key TEXT)
RETURNS TEXT
LANGUAGE sql SECURITY DEFINER SET search_path = public, pg_temp
AS $$ UPDATE public.events SET snapshot_key = p_snapshot_key WHERE id = p_event_id AND facility_id = p_facility_id RETURNING snapshot_key; $$;
REVOKE EXECUTE ON FUNCTION set_event_snapshot_key(TEXT, TEXT, TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION set_event_snapshot_key(TEXT, TEXT, TEXT) TO fall_app;
