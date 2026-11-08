-- The app's own tables, with a few rows, so the framework's migrations meet tables that hold records.
create schema work;

create table work.projects (
  id serial primary key,
  organization_id integer not null,
  name text not null
);

create table work.tasks (
  id serial primary key,
  organization_id integer not null,
  project_id integer not null references work.projects (id),
  title text not null,
  hours numeric(6, 2)
);
create index on work.projects (organization_id);
create index on work.tasks (organization_id);
create index on work.tasks (project_id);

insert into work.projects (organization_id, name) values (1, 'Launch'), (1, 'Upkeep');
insert into work.tasks (organization_id, project_id, title, hours) values (1, 1, 'Write the docs', 12), (1, 1, 'Ship it', 4), (1, 2, 'Rotate the keys', null);
