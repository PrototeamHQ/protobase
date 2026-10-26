create schema hr;

-- Legacy payroll import: uppercase identifiers, kept as-is on purpose.
create table hr."EMP_MASTER" (
  "EMP_ID" integer primary key,
  "ORGANIZATION_ID" integer not null references core.organizations (id),
  "EMP_NAME" varchar(60) not null,
  "DEPT_CD" char(3) not null,
  "HIRE_DT" date not null,
  "SAL_AMT" numeric(10, 2),
  "MGR_ID" integer references hr."EMP_MASTER" ("EMP_ID"),
  "ACTIVE_FLG" char(1) not null default 'Y' check ("ACTIVE_FLG" in ('Y', 'N'))
);

create index "EMP_MASTER_ORG_IDX" on hr."EMP_MASTER" ("ORGANIZATION_ID");
create index "EMP_MASTER_MGR_IDX" on hr."EMP_MASTER" ("MGR_ID");
