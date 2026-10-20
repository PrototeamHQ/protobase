import type { HttpTrigger } from './source-facts'

/** Whether `trigger` is a Database Webhook: Supabase's dashboard makes them as triggers calling this function. */
export const isWebhook = (trigger: HttpTrigger) => trigger.function === 'supabase_functions.http_request'

/**
 * `supabase_functions.http_request`, which Database Webhooks' triggers call, over pg_net as Supabase defines it
 * (supabase/supabase `docker/volumes/db/webhooks.sql`): the trigger's arguments are the URL, the method (GET or POST),
 * the headers, the query parameters and the timeout in milliseconds, and a POST sends the row as Supabase does. Unlike
 * Supabase's, it keeps no `hooks` table of its own, since pg_net keeps each response in `net._http_response`; and it
 * runs as its owner, so the API roles whose writes fire a webhook need no rights on pg_net.
 */
export const webhooksShim = `CREATE SCHEMA IF NOT EXISTS supabase_functions;
CREATE FUNCTION supabase_functions.http_request() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $function$
DECLARE
  url text := TG_ARGV[0]::text;
  method text := TG_ARGV[1]::text;
  headers jsonb := CASE WHEN TG_ARGV[2] IS NULL OR TG_ARGV[2] = 'null' THEN '{"Content-Type": "application/json"}'::jsonb ELSE TG_ARGV[2]::jsonb END;
  params jsonb := CASE WHEN TG_ARGV[3] IS NULL OR TG_ARGV[3] = 'null' THEN '{}'::jsonb ELSE TG_ARGV[3]::jsonb END;
  timeout_ms integer := CASE WHEN TG_ARGV[4] IS NULL OR TG_ARGV[4] = 'null' THEN 1000 ELSE TG_ARGV[4]::integer END;
BEGIN
  IF url IS NULL OR url = 'null' THEN
    RAISE EXCEPTION 'url argument is missing';
  END IF;
  CASE method
    WHEN 'GET' THEN
      PERFORM net.http_get(url, params, headers, timeout_ms);
    WHEN 'POST' THEN
      PERFORM net.http_post(
        url,
        jsonb_build_object('old_record', OLD, 'record', NEW, 'type', TG_OP, 'table', TG_TABLE_NAME, 'schema', TG_TABLE_SCHEMA),
        params,
        headers,
        timeout_ms
      );
    ELSE
      RAISE EXCEPTION 'method argument % is invalid', method;
  END CASE;
  RETURN NEW;
END
$function$;
REVOKE ALL ON FUNCTION supabase_functions.http_request() FROM PUBLIC;
`
