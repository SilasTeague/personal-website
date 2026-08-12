# deploy/

How the Lightsail instance keeps its Dahlia binary current without ever cloning
the engine's source.

## The shape

```
  Dahlia repo ── push a v* tag
        │
        ▼
  .github/workflows/release.yml
        builds docker/Dockerfile.release for linux/amd64 + linux/arm64,
        smoke-tests each artifact, uploads them plus SHA256SUMS
        to a GitHub Release
        │
        │  plain HTTPS, unauthenticated, outbound only
        ▼
  this instance ── dahlia-update.timer, every 15 min
        dahlia-update.sh
          fetch SHA256SUMS · compare · download · verify · atomic rename
        │
        ▼
  /srv/dahlia/bin/dahlia ◀── DAHLIA_ENGINE_PATH in personal-website.service
```

## Why it pulls

Having the release workflow SSH into this box would mean an inbound SSH hole, a
long-lived private key in GitHub's secrets, and a release that fails permanently
if the instance happens to be down at that moment. Polling needs no inbound
access and no credentials at all — the Dahlia repo is public, so the download is
an anonymous GET — and a missed window is picked up on the next tick.

It also means nothing upstream has to know this instance's architecture. The
updater reads its own `uname -m` and asks for the matching asset.

## Why the binary lives outside the deploy tree

Deploys are an rsync of this repo, and the repo has an `engine/` directory. If
the updater wrote there, the next `rsync --delete` would either delete the
current binary or quietly replace it with a stale one built on the laptop.

So production points `DAHLIA_ENGINE_PATH` at `/srv/dahlia/bin/dahlia`, which
rsync never touches. `engine/` stays what it is for development, and the two
never contend.

## Why no restart is needed

The website spawns a fresh engine process per game, and `createEngine()`
re-checks the path each time. The updater installs by renaming over the target,
which is atomic: a game in progress keeps running against the old inode until it
finishes, and the next new game execs the new binary. Nobody playing sees
anything.

This is also why the updater uses `mv` rather than `cp` — writing over a running
executable fails with `ETXTBSY`, while renaming over it does not.

## Installing it (one time, as root)

```
install -d /srv/dahlia/bin
install -m 755 deploy/dahlia-update.sh /usr/local/bin/dahlia-update.sh
install -m 644 deploy/dahlia-update.service deploy/dahlia-update.timer /etc/systemd/system/

systemctl daemon-reload
systemctl enable --now dahlia-update.timer

# Fetch immediately rather than waiting for the first tick.
systemctl start dahlia-update.service
journalctl -u dahlia-update.service -n 20
```

Then make sure the website unit has:

```
Environment=DAHLIA_ENGINE_PATH=/srv/dahlia/bin/dahlia
```

`personal-website.service.example` is a complete reference unit if you want one.

## Operating it

```
systemctl list-timers dahlia-update.timer     # when it next runs
journalctl -u dahlia-update.service --since today
```

Rolling back a bad release:

```
mv /srv/dahlia/bin/dahlia.prev /srv/dahlia/bin/dahlia
```

That survives until the next tick, which will pull the release forward again —
so follow it by tagging a fix, or stop the timer while you sort it out.

## Failure behaviour

| Situation | What happens |
| --- | --- |
| GitHub unreachable | `curl --fail --retry 3`, then a non-zero exit that journald records. The installed binary is untouched. |
| Truncated download | Checksum mismatch, staged file deleted, nothing installed. |
| Release missing this arch | Exits with an error rather than installing something wrong. |
| No binary at all yet | The site serves the built-in stub opponent and logs why. The chess page keeps working. |
| Binary present but broken | Not covered here — it spawns, the UCI handshake times out at 5s, and that session errors. The release workflow's smoke test (real search, well-formed move) exists to stop that reaching a tag. |
