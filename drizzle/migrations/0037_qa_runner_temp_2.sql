-- Temporary QA runner (dropped right after verification). Every run raises at the end so all test data rolls back.
CREATE OR REPLACE FUNCTION public._qa_as_user(u uuid) RETURNS void LANGUAGE sql AS $f$
  SELECT set_config('request.jwt.claims', json_build_object('sub',u,'role','authenticated')::text, true),
         set_config('request.jwt.claim.sub', u::text, true); $f$;
REVOKE ALL ON FUNCTION public._qa_as_user(uuid) FROM PUBLIC, anon, authenticated;
CREATE OR REPLACE FUNCTION public._qa_run(_sql text) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $q$
DECLARE res json;
BEGIN
  CREATE TEMP TABLE IF NOT EXISTS r(name text, result text, detail text) ON COMMIT DROP;
  EXECUTE _sql;
  SELECT json_agg(r) INTO res FROM r;
  RAISE EXCEPTION 'QA_RESULTS %', res;
END $q$;
REVOKE ALL ON FUNCTION public._qa_run(text) FROM PUBLIC, anon, authenticated;
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname='sandbox_exec') THEN
    EXECUTE 'GRANT EXECUTE ON FUNCTION public._qa_run(text) TO sandbox_exec';
  END IF;
END $$;