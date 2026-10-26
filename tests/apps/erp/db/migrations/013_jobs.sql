-- The jobs schema this version of Protobase needs, written by `protobase migration`.
-- Applied with the project's other migrations; edit or remove statements the project handles differently.

create or replace function jobs.enqueue(
  job_name text,
  payload jsonb default null,
  run_at timestamptz default null,
  key text default null,
  group_key text default null,
  priority integer default 0
) returns uuid
language plpgsql as $$
declare
  queue jobs.queue;
  start timestamptz := coalesce(run_at, jobs.job_now());
  job_id uuid;
begin
  if key is not null and group_key is not null then
    raise exception 'Job "%": an ordered job takes a group_key and no key', job_name;
  end if;
  perform jobs.create_queue(job_name, jsonb_build_object('policy', case when group_key is null then 'standard' else 'key_strict_fifo' end));
  select * into queue from jobs.queue where name = job_name;
  if (queue.policy = 'key_strict_fifo') <> (group_key is not null) then
    raise exception 'Job "%" %', job_name, case when group_key is null then 'is ordered: pass its group_key' else 'is not ordered: it takes no group_key' end;
  end if;
  if key is not null then
    select id into job_id from jobs.job
    where name = job_name and singleton_key = key and state < 'active'
    order by created_on desc limit 1;
    if found then
      return job_id;
    end if;
  end if;
  execute format(
    'insert into jobs.%I (name, data, priority, start_after, singleton_key, retry_limit, retry_delay, retry_backoff,
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
    select id into job_id from jobs.job
    where name = job_name and singleton_key = key and state < 'active'
    order by created_on desc limit 1;
  end if;
  return job_id;
end
$$;
comment on function jobs.enqueue(text, jsonb, timestamptz, text, text, integer) is 'Protobase jobs 2';

create or replace function jobs.next_due() returns timestamptz
language sql stable as $$
  select min(due) from (
    select j.start_after as due from jobs.job j
    where j.state < 'active' and not j.blocked
      and not (j.policy = 'key_strict_fifo' and exists (
        select 1 from jobs.job h where h.name = j.name and h.singleton_key = j.singleton_key and h.state = 'failed'))
    union all
    select started_on + expire_seconds * interval '1s' from jobs.job where state = 'active'
  ) jobs
$$;
comment on function jobs.next_due() is 'Protobase jobs 2';

create index if not exists job_failed_i on jobs.job (completed_on) where state = 'failed';
drop view if exists jobs.failed;
create view jobs.failed as
select id, name, data as payload, retry_count + 1 as attempts,
  coalesce(output ->> 'message', output -> 'value' ->> 'message', output ->> 'value') as error,
  output, completed_on as failed_at, created_on as created_at, singleton_key as key, false as retry
from jobs.job where state = 'failed';
create or replace function jobs.failed_retry() returns trigger
language plpgsql as $$
begin
  if new.retry then
    update jobs.job
    set state = 'retry', retry_limit = retry_limit + 1, completed_on = null,
      start_after = greatest(start_after, jobs.job_now()), keep_until = greatest(keep_until, jobs.job_now() + interval '14 days')
    where name = old.name and id = old.id and state = 'failed';
  end if;
  return new;
end
$$;
comment on function jobs.failed_retry() is 'Protobase jobs 2';
create or replace function jobs.failed_delete() returns trigger
language plpgsql as $$
begin
  delete from jobs.job where name = old.name and id = old.id and state = 'failed';
  return old;
end
$$;
comment on function jobs.failed_delete() is 'Protobase jobs 2';
create trigger failed_retry instead of update on jobs.failed for each row execute function jobs.failed_retry();
create trigger failed_delete instead of delete on jobs.failed for each row execute function jobs.failed_delete();
