# personal-website

Silas Teague's personal site. A single Next.js (TypeScript, App Router) app —
frontend and API live in one Node process, meant to run directly on the
Lightsail instance.

## Structure

```
src/
  app/                  routes (pages + API handlers), App Router conventions
    page.tsx            home page
    api/garden/tiles/   REST endpoint backing the garden feature
  features/             one directory per feature, UI + feature-local logic
    garden/              Garden.tsx, Tile.tsx, garden.module.css, types.ts
  lib/                  shared server-side code (e.g. db.ts)
public/                 static assets served as-is (sprites, images, favicon)
data/                   sqlite db file, created at runtime, gitignored
```git 

## Development

```
npm install
npm run dev
```

## Production (Lightsail)

```
npm install
npm run build
npm start        # respects $PORT, defaults to 3000
```

Run `npm start` under a process manager (systemd unit or pm2) so it restarts
on crash/reboot, and put nginx (or similar) in front for TLS/port 80-443.
The sqlite database is created at `data/garden.db` on first run — make sure
that directory persists across deploys (it's gitignored).
