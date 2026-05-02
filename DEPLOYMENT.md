# Deployment Checklist

## 1. Rotate secrets before deployment

Replace all values that were previously stored in `.env.local`.

- `DISCORD_BOT_TOKEN`
- `DISCORD_CLIENT_SECRET`
- `RIOT_API_KEY`
- `HENRIK_API_KEY`
- `NEXTAUTH_SECRET`

## 2. Prepare a PostgreSQL database

Recommended initial layout:

- Web: Vercel
- Bot: VPS
- Database: PostgreSQL on the VPS

Set `DATABASE_URL` with this shape:

```env
DATABASE_URL=postgresql://postgres:password@host:5432/valorant_dashboard?schema=public
```

## 3. Initialize the database in early-stage development

This project was originally built on SQLite and is now prepared for PostgreSQL.
Because the project is still in early development, initialize the PostgreSQL schema with:

```bash
npm run db:push
```

Generate the Prisma client if needed:

```bash
npm run db:generate
```

## 4. Web deployment

Set these environment variables in Vercel:

- `DISCORD_CLIENT_ID`
- `DISCORD_CLIENT_SECRET`
- `NEXTAUTH_SECRET`
- `NEXTAUTH_URL`
- `DATABASE_URL`
- `RIOT_API_KEY`
- `HENRIK_API_KEY`
- `TRACKER_GG_API_KEY`
- `DISCORD_GUILD_ID`

Build command:

```bash
npm run build
```

## 5. Bot deployment

Set the same `.env` values on the VPS, especially:

- `DISCORD_BOT_TOKEN`
- `DISCORD_CLIENT_ID`
- `DISCORD_CLIENT_SECRET`
- `DISCORD_GUILD_ID`
- `DATABASE_URL`

Run the bot with a process manager such as PM2:

```bash
npm run bot
```

## 6. Recommended next cleanup

- Fix remaining lint errors
- Add a production seed/bootstrap script
- Separate bot and web deployment docs
- Replace temporary `db push` usage with proper PostgreSQL migrations
