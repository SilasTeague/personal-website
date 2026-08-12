# personal-website

Silas Teague's personal site. A single Next.js (TypeScript, App Router) app —
frontend and API live in one Node process, meant to run directly on the
Lightsail instance.

Next is hosted by a small custom server (`server.ts`) rather than `next start`,
because the chess feature needs to accept WebSocket upgrades, which App Router
route handlers cannot do.

## Structure

```
server.ts               custom Node server: hosts Next + the chess WebSocket
src/
  app/                  routes (pages + API handlers), App Router conventions
    page.tsx            home page
    chess/              the "play Dahlia" page
    api/garden/tiles/   REST endpoint backing the garden feature
  features/             one directory per feature, UI + feature-local logic
    garden/              Garden.tsx, Tile.tsx, garden.module.css, types.ts
    chess/               board UI, game state, and the shared wire protocol
  server/               code run by server.ts, outside the Next bundle
    chess/               engine processes, game sessions, session limits
  lib/                  shared server-side code (e.g. db.ts)
public/                 static assets served as-is (sprites, images, favicon)
engine/                 locally built Dahlia binaries, gitignored (dev only)
scripts/                build helpers
deploy/                 systemd units + the engine auto-updater that runs on the instance
data/                   sqlite db file, created at runtime, gitignored
```

## Development

```
npm install
npm run dev
```

The chess page falls back to a built-in stub opponent unless a Dahlia binary is
present. To play the real engine locally:

```
scripts/install-engine.sh --native
```

## Production (Lightsail)

Deploys are an rsync from the laptop:

```
npm run build

rsync -az --delete \
      --exclude node_modules --exclude .git --exclude data --exclude engine \
      ./ lightsail:/srv/personal-website/
```

Then on the instance:

```
npm ci --omit=dev
sudo systemctl restart personal-website
```

The engine binary is **not** part of this. A systemd timer on the instance
tracks Dahlia's releases and installs into `/srv/dahlia/bin/`, outside the rsync
tree — which is why `engine/` is excluded above, and why `DAHLIA_ENGINE_PATH` is
set in the unit file. See `deploy/README.md`; it's a one-time setup.

Run the server under a process manager (systemd unit or pm2) so it restarts on
crash/reboot, and put nginx (or similar) in front for TLS/port 80-443. The
sqlite database is created at `data/garden.db` on first run — make sure that
directory persists across deploys (it's gitignored, and excluded above so a
deploy can't wipe it).

Two requirements the custom server adds:

- **Node 22.18+** (or 23.6+), since `server.ts` is run through Node's built-in
  TypeScript stripping. If the host is older, compile the server with `tsc`
  first and run the emitted JS.
- **nginx must forward WebSocket upgrades**, or the chess page will never
  connect:

  ```nginx
  location /api/chess/ws {
      proxy_pass http://127.0.0.1:3000;
      proxy_http_version 1.1;
      proxy_set_header Upgrade $http_upgrade;
      proxy_set_header Connection "upgrade";
      proxy_read_timeout 3600s;
  }
  ```

## Chess (Dahlia)

`/chess` lets a visitor play [Dahlia](https://github.com/SilasTeague/Dahlia),
my C++ engine. The server owns the authoritative position (via `chess.js`),
both clocks, and one engine process per game.

Dahlia's search runs on its own thread and honours `stop`, so a search that
overruns its budget is asked to stop and return its best move so far; killing
the process is only the fallback when it ignores that too. The search is still
single-threaded and CPU-bound for the whole of its movetime, though, so the
limits below exist to keep three games from swamping a small instance.

Only one `go` may be in flight per engine — a second one is silently dropped
with no `bestmove` — so `UciEngine` serialises searches per process.

| Variable | Default | Purpose |
| --- | --- | --- |
| `DAHLIA_ENGINE_PATH` | `engine/dahlia-<platform>-<arch>` | Path to the `dahlia` binary. Rarely needed — the default resolves the right binary per host. If it isn't executable, a built-in stub opponent stands in so the site still works. |
| `CHESS_MOVETIME_MS` | `800` | Hard ceiling on one engine search. The per-move budget is `min(remaining / 30, this)`. |
| `CHESS_MAX_CONCURRENT_SEARCHES` | `2` | How many engine searches may run at once across all games. Keeps three players from pegging three cores. |

Other limits, fixed in code: at most 3 concurrent games (further visitors are
told the boards are busy), a `movetime + 1.5s` watchdog that sends `stop` and
then kills an engine that ignores it, and a 10-minute idle reaper. Engine processes are killed when the
socket closes, so leaving the page reclaims the slot immediately.

### The binary

**In development**, `scripts/install-engine.sh` builds one out of the Dahlia
checkout (set `DAHLIA_REPO` if it isn't at `~/projects/Dahlia`) and leaves it in
`engine/`. Linux builds go through Docker — as a source of a Linux toolchain,
not as a runtime; nothing runs Dahlia in a container. They're statically linked,
so they don't depend on the host's glibc version. See `engine/README.md` for the
naming convention.

**In production**, nobody builds anything by hand. Pushing a `v*` tag to the
Dahlia repo triggers a workflow that builds and publishes both Linux
architectures, and a systemd timer on the instance notices and installs the one
it needs. `deploy/README.md` covers it; the short version is that the instance
polls, so it needs no inbound access and holds no credentials.

Because the server spawns a fresh engine per game and re-checks the path each
time, an engine update needs no restart and interrupts no game in progress.

Piece art is the Cburnett set (GPLv2+); see
`public/assets/chess/pieces/LICENSE`.
