-- Minimal stand-in for the Pre-qual / Supabase schema the orientation
-- migration depends on. Used only for local testing (not a migration).
create extension if not exists pgcrypto;
create schema if not exists auth;
create table if not exists auth.users (id uuid primary key default gen_random_uuid(), email text);
create or replace function auth.uid() returns uuid language sql stable as
  $$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
do $$ begin
  if not exists (select 1 from pg_roles where rolname='anon') then create role anon; end if;
  if not exists (select 1 from pg_roles where rolname='authenticated') then create role authenticated; end if;
end $$;
create or replace function update_updated_at_column() returns trigger language plpgsql as
  $$ begin new.updated_at = now(); return new; end $$;
create table if not exists companies (
  id uuid primary key default gen_random_uuid(), name text not null,
  type text not null check (type in ('gc','trade','owner')),
  created_at timestamptz default now(), updated_at timestamptz default now());
create table if not exists profiles (
  id uuid primary key references auth.users, role text not null default 'owner',
  full_name text, email text, new_company_id uuid references companies(id),
  company_type text, user_role text not null default 'admin',
  is_mojo_admin boolean not null default false, created_at timestamptz default now());
create table if not exists projects (
  id uuid primary key default gen_random_uuid(), name text not null, description text,
  address text, owner_id uuid references profiles(id), start_date date, end_date date,
  created_at timestamptz default now(), updated_at timestamptz default now());
create table if not exists project_members (
  id uuid primary key default gen_random_uuid(), project_id uuid references projects(id) on delete cascade,
  user_id uuid references profiles(id), role text, joined_at timestamptz default now());
create table if not exists notifications (
  id uuid primary key default gen_random_uuid(), user_id uuid not null references profiles(id),
  type text not null, title text not null, body text, link text,
  is_read boolean not null default false, created_at timestamptz not null default now());
