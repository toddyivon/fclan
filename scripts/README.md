# Scripts

Database migrations are managed with the **Supabase CLI**. Do not commit bespoke
migration scripts — they historically drifted from `supabase/migrations/*.sql`
and hardcoded service-role credentials.

## Apply migrations

```bash
# one-time
npm i -g supabase
supabase login
supabase link --project-ref <your-project-ref>

# apply everything under supabase/migrations/ in order
supabase db push
```

## Generate types

```bash
supabase gen types typescript --linked > src/lib/supabase/database.types.ts
```
