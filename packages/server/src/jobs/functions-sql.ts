/** Bumped whenever the objects below change, so the next migration writes them again. */
export const functionsVersion = 3

/** The comment each Protobase function in the jobs schema carries, which the startup check reads. */
export const functionsComment = `Protobase jobs ${functionsVersion}`

/** Protobase's own functions beside pg-boss's tables, by name; each carries `functionsComment`. */
export const functionNames = ['enqueue', 'next_due', 'failed_retry', 'failed_delete']

/**
 * `jobs.enqueue(name, payload, run_at, key, group_key, priority)`: a job from SQL, such as a trigger, in the caller's
 * transaction. It inserts what pg-boss's `send()` does, with the queue's retry settings; it creates a queue that no
 * worker has created yet. A `key` keeps one waiting job, as `mode: 'dedupe'` does, and an ordered job takes its group
 * as `group_key`, and an id from `uuidv7()`, which rises within a database session: pg-boss runs a group's jobs by their
 * transaction's start, then by id, so the jobs one transaction enqueues run in that order. Tied to the pg-boss schema
 * version, which the startup check pins.
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
       retry_delay_max, expire_seconds, deletion_seconds, keep_until, policy, dead_letter, heartbeat_seconds, upsert_by_key, id)
     values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $4 + $12 * interval ''1s'', $13, $14, $15, $16, $17)
     on conflict do nothing
     returning id',
    queue.table_name)
  using job_name, payload, priority, start, coalesce(key, group_key), queue.retry_limit, queue.retry_delay,
    queue.retry_backoff, queue.retry_delay_max, queue.expire_seconds, queue.deletion_seconds, queue.retention_seconds,
    queue.policy, queue.dead_letter, queue.heartbeat_seconds, key is not null,
    case when group_key is null then gen_random_uuid() else uuidv7() end
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

/**
 * `jobs.next_due()`: when the next job is due, or `null` when none waits: what a host that sleeps reads to know when to
 * wake the app, through any pooler. A waiting job counts from its start time, unless a failed job holds back its ordered
 * group; a running one from when its try times out, since its worker may have died with the app. Recurring jobs wait
 * as their next run, so they count too.
 */
const nextDue = (schema: string) => `create or replace function ${schema}.next_due() returns timestamptz
language sql stable as $$
  select min(due) from (
    select j.start_after as due from ${schema}.job j
    where j.state < 'active' and not j.blocked
      and not (j.policy = 'key_strict_fifo' and exists (
        select 1 from ${schema}.job h where h.name = j.name and h.singleton_key = j.singleton_key and h.state = 'failed'))
    union all
    select started_on + expire_seconds * interval '1s' from ${schema}.job where state = 'active'
  ) jobs
$$;
comment on function ${schema}.next_due() is '${functionsComment}';`

/**
 * `jobs.failed`: the failed jobs, for the admin app's page, with their last error. Updating `retry` to true retries a
 * job, as pg-boss's `retry()` does: one more attempt, from now; deleting a row deletes the job.
 */
const failed = (schema: string) => `create index if not exists job_failed_i on ${schema}.job (completed_on) where state = 'failed';
drop view if exists ${schema}.failed;
create view ${schema}.failed as
select id, name, data as payload, retry_count + 1 as attempts,
  coalesce(output ->> 'message', output -> 'value' ->> 'message', output ->> 'value') as error,
  output, completed_on as failed_at, created_on as created_at, singleton_key as key, false as retry
from ${schema}.job where state = 'failed';
create or replace function ${schema}.failed_retry() returns trigger
language plpgsql as $$
begin
  if new.retry then
    update ${schema}.job
    set state = 'retry', retry_limit = retry_limit + 1, completed_on = null,
      start_after = greatest(start_after, ${schema}.job_now()), keep_until = greatest(keep_until, ${schema}.job_now() + interval '14 days')
    where name = old.name and id = old.id and state = 'failed';
  end if;
  return new;
end
$$;
comment on function ${schema}.failed_retry() is '${functionsComment}';
create or replace function ${schema}.failed_delete() returns trigger
language plpgsql as $$
begin
  delete from ${schema}.job where name = old.name and id = old.id and state = 'failed';
  return old;
end
$$;
comment on function ${schema}.failed_delete() is '${functionsComment}';
create trigger failed_retry instead of update on ${schema}.failed for each row execute function ${schema}.failed_retry();
create trigger failed_delete instead of delete on ${schema}.failed for each row execute function ${schema}.failed_delete();`

/** The statements that create or replace every Protobase object in `schema`. */
export const functionsSql = (schema: string) => [enqueue(schema), nextDue(schema), failed(schema)].join('\n\n')
