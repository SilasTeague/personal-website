/**
 * Caps how many engine searches run at once across all sessions.
 *
 * Dahlia's search is single-threaded and fully CPU-bound for the whole of its
 * movetime, so three simultaneous games would otherwise peg three cores on a
 * Lightsail box that may only have two. Searches are sub-second, so queueing
 * here costs a player almost nothing while keeping the host responsive.
 */
const MAX_CONCURRENT_SEARCHES = Math.max(
  1,
  Number(process.env.CHESS_MAX_CONCURRENT_SEARCHES ?? 2)
);

let active = 0;
const waiting: (() => void)[] = [];

function acquire(): Promise<void> {
  if (active < MAX_CONCURRENT_SEARCHES) {
    active++;
    return Promise.resolve();
  }
  return new Promise((resolve) => {
    waiting.push(() => {
      active++;
      resolve();
    });
  });
}

function release() {
  active--;
  waiting.shift()?.();
}

/** Run `fn` with a search slot held, releasing it however `fn` settles. */
export async function withSearchSlot<T>(fn: () => Promise<T>): Promise<T> {
  await acquire();
  try {
    return await fn();
  } finally {
    release();
  }
}
