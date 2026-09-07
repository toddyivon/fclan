# Supabase self-hosted — GT7 Telemetry

Stack oficial de self-hosting do Supabase (snapshot de `supabase/supabase@135ab6d`,
2026-06-10) com Postgres 17, adaptado para este projeto. Substitui o Supabase
cloud por completo: Auth (GoTrue), PostgREST, Realtime, Storage, Studio e
Supavisor (pooler), atrás do Kong.

## Portas (local)

| Serviço | Porta | Observação |
|---|---|---|
| Kong (API gateway — é a "SUPABASE_URL") | **8100** | 8000 estava ocupada pelo batvision |
| Kong HTTPS | 8543 | |
| Postgres via Supavisor (session mode) | 5432 | usuário: `postgres.gt7local` |
| Supavisor (transaction mode) | 6543 | |
| Studio | via Kong: http://localhost:8100 | login: `DASHBOARD_USERNAME`/`DASHBOARD_PASSWORD` do `.env` |

## Rodar

```bash
cd infra/supabase
docker compose up -d          # COMPOSE_FILE no .env já inclui o override pg17
./apply-migrations.sh         # aplica ../../supabase/migrations (idempotente)
```

O `.env` **não é commitado** (contém os segredos). Para recriar do zero:

```bash
cp .env.example .env
sh utils/generate-keys.sh --update-env
# depois reaplique as customizações: COMPOSE_FILE com pg17, KONG_HTTP_PORT=8100,
# SUPABASE_PUBLIC_URL/API_EXTERNAL_URL, SITE_URL, ENABLE_EMAIL_AUTOCONFIRM=true,
# POOLER_TENANT_ID=gt7local
```

O app lê as chaves de `.env.local` (dev) e `.env.production.local` (build/test)
na raiz do repo — ambos já apontam para `http://localhost:8100`. A config antiga
do cloud está preservada em `.env.local.cloud.bak`.

Dados de demonstração (usuário, sessão com 3 voltas, API key):

```bash
SUPABASE_URL=http://localhost:8100 \
SUPABASE_SERVICE_ROLE_KEY=$(grep '^SERVICE_ROLE_KEY=' infra/supabase/.env | cut -d= -f2) \
node scripts/seed-demo.mjs seu@email.com suasenha
```

## Operação

```bash
docker compose ps                  # saúde dos serviços
docker compose logs -f auth        # logs de um serviço
docker compose down                # para (dados persistem em volumes/db/data)
./reset.sh                         # ATENÇÃO: apaga o banco e recomeça do zero
```

Backup do banco:

```bash
docker compose exec -T db pg_dump -U postgres -d postgres | gzip > backup-$(date +%F).sql.gz
```

## Deploy no LXC (produção)

1. Copie `infra/supabase/` para o servidor (o `deploy.sh` do app exclui infra —
   copie manualmente ou ajuste o rsync).
2. **Gere segredos novos** (`sh utils/generate-keys.sh --update-env`) — nunca
   reuse os de dev. Guarde o `.env` fora do git.
3. Ajuste no `.env`: `SUPABASE_PUBLIC_URL`/`API_EXTERNAL_URL` para o domínio
   real (com TLS na frente — o repo oficial tem overrides
   `docker-compose.caddy.yml`/`nginx.yml` para Let's Encrypt),
   `SITE_URL` para a URL pública do app, `ENABLE_EMAIL_AUTOCONFIRM=false` e
   configure `SMTP_*` reais (senão signup/reset de senha não enviam e-mail).
4. `docker compose up -d && ./apply-migrations.sh`.
5. No `.env.production` do app: `NEXT_PUBLIC_SUPABASE_URL` = URL pública do
   Kong, `NEXT_PUBLIC_SUPABASE_ANON_KEY`/`SUPABASE_SERVICE_ROLE_KEY` do novo
   `.env`, `DATABASE_URL=postgresql://postgres.<POOLER_TENANT_ID>:<senha>@<host>:5432/postgres`.
6. Agende backup diário do `pg_dump` acima (cron do host).
7. Atenção LXC: se o Docker reclamar de sysctl/AppArmor (como no compose do
   app), aplique `network_mode: host` + `security_opt: apparmor:unconfined`
   nos serviços — mesmo padrão de `docker-compose.lxc.yml` na raiz.

## Migrações futuras

Novos arquivos em `supabase/migrations/` são aplicados com
`./apply-migrations.sh` (rastreia em `supabase_migrations.schema_migrations`,
compatível com `supabase db push --db-url` se preferir o CLI).
