# engine/

Where the compiled [Dahlia](https://github.com/SilasTeague/Dahlia) binaries live.
The binaries themselves are gitignored; this file is what keeps the directory in
the repo.

## Naming

```
engine/dahlia-<platform>-<arch>
```

`<platform>` and `<arch>` are Node's own spellings — `process.platform` and
`process.arch` — because that is literally how the server finds the file:

```ts
`engine/dahlia-${process.platform}-${process.arch}`
```

So the realistic contents are `dahlia-darwin-arm64` (the dev Mac) and
`dahlia-linux-x64` (Lightsail). Both can sit here at once, and the same checkout
picks the right one on either machine with no environment variable and no branch
in the deploy script. Note that `arch` is `x64`, not `x86_64` or `amd64`.

If the file for the current platform is missing or isn't executable, the server
falls back to a built-in stub opponent and logs why — the chess page still works,
it just isn't playing Dahlia. `DAHLIA_ENGINE_PATH` overrides the lookup entirely
if you ever need to point at a binary somewhere else.

## Filling it

From the website repo:

```
scripts/install-engine.sh            # Linux x64 + arm64, for deploying
scripts/install-engine.sh --native   # a build for this machine, for npm run dev
```

The Linux builds go through Docker, which is acting purely as a Linux toolchain
— nothing runs Dahlia in a container. They're statically linked, so they don't
care which glibc the instance has. See `docker/Dockerfile.release` in the Dahlia
repo for the details.

## This directory is development-only

Production does not use it. Deploys exclude `engine/` from the rsync, and the
instance sets `DAHLIA_ENGINE_PATH` to `/srv/dahlia/bin/dahlia` — a path outside
the deploy tree, kept current by a systemd timer that tracks Dahlia's tagged
releases. See `deploy/README.md`.

That separation is deliberate: if both a deploy and the updater could write the
same file, an `rsync --delete` would eventually replace the current engine with
whatever stale build happened to be on the laptop, silently.

So the only reason to put a binary here is to play the real engine during
`npm run dev` instead of the stub.
