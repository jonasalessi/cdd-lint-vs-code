const waitLimitMs = 5_000;
const pollIntervalMs = 25;

// Longer than the 50 ms request delay plus the start of the fake binary.
export const settleTimeMs = 500;

export function sleep(durationMs: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, durationMs));
}

// Use it before an assertion that an action started no run.
export function settle(): Promise<void> {
  return sleep(settleTimeMs);
}

type Reading<T> = T | undefined | Promise<T | undefined>;

// Polls until `read` gives a value that is not undefined. Fails after 5 seconds.
export async function waitFor<T>(description: string, read: () => Reading<T>): Promise<T> {
  const deadline = Date.now() + waitLimitMs;
  for (;;) {
    const value = await read();
    if (value !== undefined) {
      return value;
    }
    if (Date.now() > deadline) {
      throw new Error(`Timeout after ${waitLimitMs} ms: ${description}`);
    }
    await sleep(pollIntervalMs);
  }
}
