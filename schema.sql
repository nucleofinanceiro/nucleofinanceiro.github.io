-- =====================================================================
-- Núcleo Financeiro — estrutura do banco (Supabase / PostgreSQL)
-- Cole este arquivo inteiro no SQL Editor do Supabase e clique em Run.
-- Pode ser executado de novo sem perder dados.
-- =====================================================================

create extension if not exists pgcrypto;

-- ---------- Tabelas ----------
create table if not exists public.empresas (
  id          uuid primary key default gen_random_uuid(),
  nome        text not null,
  cnpj        text not null default '',
  banco       text not null default '',
  config      jsonb not null default '{}'::jsonb,   -- sócios e parâmetros de cálculo
  criado_por  uuid not null default auth.uid() references auth.users(id),
  criado_em   timestamptz not null default now()
);

create table if not exists public.membros (
  empresa_id  uuid not null references public.empresas(id) on delete cascade,
  user_id     uuid not null references auth.users(id) on delete cascade,
  papel       text not null check (papel in ('dono','editor','leitor')),
  email       text,
  criado_em   timestamptz not null default now(),
  primary key (empresa_id, user_id)
);
create index if not exists membros_user_idx on public.membros(user_id);

create table if not exists public.convites (
  codigo      text primary key default encode(gen_random_bytes(5), 'hex'),
  empresa_id  uuid not null references public.empresas(id) on delete cascade,
  papel       text not null check (papel in ('editor','leitor')),
  criado_por  uuid not null default auth.uid(),
  criado_em   timestamptz not null default now(),
  expira_em   timestamptz not null default now() + interval '7 days',
  usado_por   uuid,
  usado_em    timestamptz
);

create table if not exists public.extratos (
  id            uuid primary key default gen_random_uuid(),
  empresa_id    uuid not null references public.empresas(id) on delete cascade,
  mes           text not null check (mes ~ '^\d{4}-\d{2}$'),
  banco         text not null,
  saldo_inicial numeric(14,2),
  saldo_final   numeric(14,2),
  conciliado    boolean not null default false,
  arquivos      jsonb not null default '[]'::jsonb,  -- [{path, nome, tamanho, tipo, enviado_em}]
  criado_em     timestamptz not null default now(),
  unique (empresa_id, mes, banco)
);

create table if not exists public.lancamentos (
  id              uuid primary key default gen_random_uuid(),
  empresa_id      uuid not null references public.empresas(id) on delete cascade,
  tipo            text not null check (tipo in ('entrada','saida')),
  grupo           text not null check (grupo in ('receita','despesa','imposto','prolabore','socios','transferencia')),
  categoria       text not null,
  descricao       text not null,
  valor           numeric(14,2) not null check (valor >= 0),
  competencia     text not null check (competencia ~ '^\d{4}-\d{2}$'),
  vencimento      date,
  status          text not null default 'pendente' check (status in ('pendente','pago')),
  data_pagamento  date,
  socio_id        text,
  obs             text not null default '',
  origem          text not null default 'manual',
  fitid           text,
  extrato_id      uuid references public.extratos(id) on delete set null,
  ref_prolabore   uuid,
  detalhes        jsonb,
  criado_por      uuid default auth.uid(),
  criado_em       timestamptz not null default now(),
  atualizado_em   timestamptz not null default now(),
  constraint lanc_fitid_uk unique (empresa_id, extrato_id, fitid)
);
create index if not exists lanc_empresa_idx on public.lancamentos(empresa_id, competencia);

-- ---------- Funções de permissão ----------
create or replace function public.meu_papel(e uuid) returns text
language sql stable security definer set search_path = public as $$
  select papel from public.membros where empresa_id = e and user_id = auth.uid()
$$;
create or replace function public.pode_ler(e uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.membros where empresa_id = e and user_id = auth.uid())
$$;
create or replace function public.pode_editar(e uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.membros where empresa_id = e and user_id = auth.uid() and papel in ('dono','editor'))
$$;
create or replace function public.e_dono(e uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.membros where empresa_id = e and user_id = auth.uid() and papel = 'dono')
$$;

-- Cria a empresa e coloca quem criou como dono
create or replace function public.criar_empresa(p_nome text, p_cnpj text default '', p_banco text default '', p_config jsonb default '{}'::jsonb)
returns uuid language plpgsql security definer set search_path = public as $$
declare v uuid;
begin
  if auth.uid() is null then raise exception 'Entre na sua conta primeiro.'; end if;
  if coalesce(trim(p_nome), '') = '' then raise exception 'Informe o nome da empresa.'; end if;
  insert into public.empresas (nome, cnpj, banco, config, criado_por)
    values (trim(p_nome), coalesce(p_cnpj, ''), coalesce(p_banco, ''), coalesce(p_config, '{}'::jsonb), auth.uid())
    returning id into v;
  insert into public.membros (empresa_id, user_id, papel, email)
    values (v, auth.uid(), 'dono', (select email from auth.users where id = auth.uid()));
  return v;
end $$;

-- Aceita um convite pelo código
create or replace function public.aceitar_convite(p_codigo text)
returns uuid language plpgsql security definer set search_path = public as $$
declare c public.convites;
begin
  if auth.uid() is null then raise exception 'Entre na sua conta primeiro.'; end if;
  select * into c from public.convites
    where codigo = lower(trim(p_codigo)) and usado_em is null and expira_em > now()
    for update;
  if not found then raise exception 'Convite inválido, já usado ou expirado.'; end if;
  insert into public.membros (empresa_id, user_id, papel, email)
    values (c.empresa_id, auth.uid(), c.papel, (select email from auth.users where id = auth.uid()))
    on conflict (empresa_id, user_id) do nothing;
  update public.convites set usado_por = auth.uid(), usado_em = now() where codigo = c.codigo;
  return c.empresa_id;
end $$;

-- Impede que a empresa fique sem dono
create or replace function public.protege_ultimo_dono() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if (tg_op = 'DELETE' and old.papel = 'dono') or (tg_op = 'UPDATE' and old.papel = 'dono' and new.papel <> 'dono') then
    if exists (select 1 from public.empresas where id = old.empresa_id)
       and not exists (select 1 from public.membros where empresa_id = old.empresa_id and papel = 'dono' and user_id <> old.user_id) then
      raise exception 'A empresa precisa ter pelo menos um dono.';
    end if;
  end if;
  return coalesce(new, old);
end $$;
drop trigger if exists membros_ultimo_dono on public.membros;
create trigger membros_ultimo_dono before update or delete on public.membros
  for each row execute function public.protege_ultimo_dono();

revoke all on function public.criar_empresa(text, text, text, jsonb) from public, anon;
revoke all on function public.aceitar_convite(text) from public, anon;
grant execute on function public.criar_empresa(text, text, text, jsonb) to authenticated;
grant execute on function public.aceitar_convite(text) to authenticated;
grant execute on function public.meu_papel(uuid), public.pode_ler(uuid), public.pode_editar(uuid), public.e_dono(uuid) to authenticated;

-- ---------- Regras de acesso (Row Level Security) ----------
alter table public.empresas    enable row level security;
alter table public.membros     enable row level security;
alter table public.convites    enable row level security;
alter table public.extratos    enable row level security;
alter table public.lancamentos enable row level security;

drop policy if exists empresas_ler on public.empresas;
drop policy if exists empresas_editar on public.empresas;
drop policy if exists empresas_excluir on public.empresas;
create policy empresas_ler     on public.empresas for select to authenticated using (public.pode_ler(id));
create policy empresas_editar  on public.empresas for update to authenticated using (public.e_dono(id)) with check (public.e_dono(id));
create policy empresas_excluir on public.empresas for delete to authenticated using (public.e_dono(id));

drop policy if exists membros_ler on public.membros;
drop policy if exists membros_alterar on public.membros;
drop policy if exists membros_remover on public.membros;
create policy membros_ler     on public.membros for select to authenticated using (public.pode_ler(empresa_id));
create policy membros_alterar on public.membros for update to authenticated using (public.e_dono(empresa_id)) with check (public.e_dono(empresa_id));
create policy membros_remover on public.membros for delete to authenticated using (public.e_dono(empresa_id) or user_id = auth.uid());

drop policy if exists convites_ler on public.convites;
drop policy if exists convites_criar on public.convites;
drop policy if exists convites_excluir on public.convites;
create policy convites_ler     on public.convites for select to authenticated using (public.e_dono(empresa_id));
create policy convites_criar   on public.convites for insert to authenticated with check (public.e_dono(empresa_id));
create policy convites_excluir on public.convites for delete to authenticated using (public.e_dono(empresa_id));

drop policy if exists extratos_ler on public.extratos;
drop policy if exists extratos_criar on public.extratos;
drop policy if exists extratos_alterar on public.extratos;
drop policy if exists extratos_excluir on public.extratos;
create policy extratos_ler     on public.extratos for select to authenticated using (public.pode_ler(empresa_id));
create policy extratos_criar   on public.extratos for insert to authenticated with check (public.pode_editar(empresa_id));
create policy extratos_alterar on public.extratos for update to authenticated using (public.pode_editar(empresa_id)) with check (public.pode_editar(empresa_id));
create policy extratos_excluir on public.extratos for delete to authenticated using (public.pode_editar(empresa_id));

drop policy if exists lanc_ler on public.lancamentos;
drop policy if exists lanc_criar on public.lancamentos;
drop policy if exists lanc_alterar on public.lancamentos;
drop policy if exists lanc_excluir on public.lancamentos;
create policy lanc_ler     on public.lancamentos for select to authenticated using (public.pode_ler(empresa_id));
create policy lanc_criar   on public.lancamentos for insert to authenticated with check (public.pode_editar(empresa_id));
create policy lanc_alterar on public.lancamentos for update to authenticated using (public.pode_editar(empresa_id)) with check (public.pode_editar(empresa_id));
create policy lanc_excluir on public.lancamentos for delete to authenticated using (public.pode_editar(empresa_id));

-- ---------- Arquivos dos extratos (Storage) ----------
-- Caminho de cada arquivo: <empresa_id>/<extrato_id>/<arquivo>
insert into storage.buckets (id, name, public, file_size_limit)
  values ('extratos', 'extratos', false, 20971520)
  on conflict (id) do nothing;

drop policy if exists extratos_arq_ler on storage.objects;
drop policy if exists extratos_arq_enviar on storage.objects;
drop policy if exists extratos_arq_excluir on storage.objects;
create policy extratos_arq_ler on storage.objects for select to authenticated
  using (bucket_id = 'extratos' and public.pode_ler(((storage.foldername(name))[1])::uuid));
create policy extratos_arq_enviar on storage.objects for insert to authenticated
  with check (bucket_id = 'extratos' and public.pode_editar(((storage.foldername(name))[1])::uuid));
create policy extratos_arq_excluir on storage.objects for delete to authenticated
  using (bucket_id = 'extratos' and public.pode_editar(((storage.foldername(name))[1])::uuid));

-- ---------- Atualização em tempo real entre sócios ----------
do $$
begin
  begin alter publication supabase_realtime add table public.lancamentos; exception when duplicate_object then null; end;
  begin alter publication supabase_realtime add table public.extratos;    exception when duplicate_object then null; end;
  begin alter publication supabase_realtime add table public.empresas;    exception when duplicate_object then null; end;
end $$;
