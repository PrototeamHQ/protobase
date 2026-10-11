/** Bumped whenever the functions below change, so the next migration writes them again. */
export const functionsVersion = 1

/** The comment each Protobase function in the jobs schema carries, which the startup check reads. */
export const functionsComment = `Protobase jobs ${functionsVersion}`

/** Protobase's own functions beside pg-boss's tables, by name. */
export const functionNames = ['enqueue']

/**
 * `jobs.enqueue(name, payload, run_at, key, group_key, priority)`: a job from SQL, such as a trigger, in the caller's
 * transaction. It inserts what pg-boss's `send()` does, with the queue's retry settings; it creates a queue that no
 * worker has created yet. A `key` keeps one waiting job, as `mode: 'dedupe'` does, and an ordered job takes its group
 * as `group_key`. Tied to the pg-boss schema version, which the startup check pins.
 */
const enqueue = (schema: string) => `create or replace function ${schema}.enqueue(
  job_name text,
  payload jsonb default null,
  run_at timestamptz default null,
  key text default null,
  group_key text default null,
  priority integer default 0
) returns uuid
language plpgsql as $$
declare
  queue ${schema}.queue;
  start timestamptz := coalesce(run_at, ${schema}.job_now());
  job_id uuid;
begin
  if key is not null and group_key is not null then
    raise exception 'Job "%": an ordered job takes a group_key and no key', job_name;
  end if;
  perform ${schema}.create_queue(job_name, jsonb_build_object('policy', case when group_key is null then 'standard' else 'key_strict_fifo' end));
  select * into queue from ${schema}.queue where name = job_name;
  if (queue.policy = 'key_strict_fifo') <> (group_key is not null) then
    raise exception 'Job "%" %', job_name, case when group_key is null then 'is ordered: pass its group_key' else 'is not ordered: it takes no group_key' end;
  end if;
  if key is not null then
    select id into job_id from ${schema}.job
    where name = job_name and singleton_key = key and state < 'active'
    order by created_on desc limit 1;
    if found then
      return job_id;
    end if;
  end if;
  execute format(
    'insert into ${schema}.%I (name, data, priority, start_after, singleton_key, retry_limit, retry_delay, retry_backoff,
       retry_delay_max, expire_seconds, deletion_seconds, keep_until, policy, dead_letter, heartbeat_seconds, upsert_by_key)
     values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $4 + $12 * interval ''1s'', $13, $14, $15, $16)
     on conflict do nothing
     returning id',
    queue.table_name)
  using job_name, payload, priority, start, coalesce(key, group_key), queue.retry_limit, queue.retry_delay,
    queue.retry_backoff, queue.retry_delay_max, queue.expire_seconds, queue.deletion_seconds, queue.retention_seconds,
    queue.policy, queue.dead_letter, queue.heartbeat_seconds, key is not null
  into job_id;
  -- A concurrent enqueue of the same key inserted first: its job is the one waiting.
  if job_id is null and key is not null then
    select id into job_id from ${schema}.job
    where name = job_name and singleton_key = key and state < 'active'
    order by created_on desc limit 1;
  end if;
  return job_id;
end
$$;
comment on function ${schema}.enqueue(text, jsonb, timestamptz, text, text, integer) is '${functionsComment}';`

/** The statements that create or replace every Protobase function in `schema`. */
export const functionsSql = (schema: string) => enqueue(schema)
