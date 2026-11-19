-- Línea base (D-018): extensiones que usa RutApp. Generado de la BD real 2026-11-19.
create extension if not exists "uuid-ossp" with schema extensions;
create extension if not exists pgcrypto with schema extensions;
create extension if not exists pg_cron with schema pg_catalog;
grant usage on schema cron to postgres;
create extension if not exists pg_net with schema extensions;
create extension if not exists pgmq;
