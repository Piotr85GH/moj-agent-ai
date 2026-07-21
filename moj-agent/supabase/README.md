# Supabase setup

Run `schema.sql` in the Supabase SQL editor for the `moj-agent` project.

The schema creates the three tables from lesson 05 / W1:

- `conversations`
- `messages`
- `user_profiles`

The app expects these environment variables in `.env.local`:

```env
NEXT_PUBLIC_SUPABASE_URL=https://xxxxx.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=eyJ...
```
