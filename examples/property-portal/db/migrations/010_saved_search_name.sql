-- A saved search's name is the one the member gives it when saving, or none: the searches page then titles it with its
-- filters. Names stored before were made from the filters and stay as they are.
alter table members.saved_searches alter column name drop not null;
