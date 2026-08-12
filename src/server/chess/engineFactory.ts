import { accessSync, constants } from "node:fs";
import { fileURLToPath } from "node:url";
import type { Engine } from "./engine.ts";
import { StubEngine } from "./stubEngine.ts";
import { UciEngine } from "./uciEngine.ts";

/**
 * Where `scripts/install-engine.sh` leaves its output.
 *
 * The file name carries the platform and architecture in Node's own spelling
 * (`linux-x64`, `darwin-arm64`), which is what lets one checkout serve both the
 * dev Mac and the Lightsail instance: the deploy copies every binary in
 * `engine/` and each host selects its own, with no environment variable to set
 * and no branch in the deploy script. See engine/README.md.
 *
 * In production `DAHLIA_ENGINE_PATH` overrides this to point outside the deploy
 * tree, at a binary a systemd timer keeps current — see deploy/README.md.
 *
 * This module runs outside the Next bundle (server.ts imports it directly), so
 * `import.meta.url` is a real path on disk rather than a bundler artifact.
 */
const defaultEnginePath = fileURLToPath(
  new URL(`../../../engine/dahlia-${process.platform}-${process.arch}`, import.meta.url)
);

const explicitPath = process.env.DAHLIA_ENGINE_PATH;
const enginePath = explicitPath ?? defaultEnginePath;

function isRunnable(path: string): boolean {
  try {
    accessSync(path, constants.X_OK);
    return true;
  } catch {
    return false;
  }
}

let lastKnown: boolean | null = null;

/**
 * Checked per game rather than cached at startup, because the binary changes
 * underneath a running server: `deploy/dahlia-update.sh` renames a new one into
 * place whenever Dahlia cuts a release. Re-reading here means an engine that
 * appears (or vanishes) is picked up by the next game instead of the next
 * restart, which is what lets updates ship with no downtime at all.
 *
 * One `access(2)` per game start is not worth caching to avoid.
 */
function engineAvailable(): boolean {
  const runnable = isRunnable(enginePath);

  // Log the transitions, not every check — otherwise this is one line per game.
  if (runnable !== lastKnown) {
    if (runnable) {
      console.log(`[chess] using Dahlia at ${enginePath}`);
    } else if (explicitPath) {
      console.warn(
        `[chess] DAHLIA_ENGINE_PATH (${explicitPath}) is not executable — falling back to the stub opponent`
      );
    } else {
      // Not an error: the site is meant to stay playable without a compiled engine.
      console.warn(
        `[chess] no engine at ${defaultEnginePath} — using the stub opponent ` +
          `(run scripts/install-engine.sh to build one)`
      );
    }
    lastKnown = runnable;
  }

  return runnable;
}

// Report the situation at boot rather than leaving the first player to discover it.
engineAvailable();

export function createEngine(): Engine {
  return engineAvailable() ? new UciEngine(enginePath) : new StubEngine();
}
