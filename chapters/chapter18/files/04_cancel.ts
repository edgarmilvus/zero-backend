/**
 * Example 4 - cancelling without killing the pool.
 *
 *   node chapters/chapter18/files/04_cancel.ts
 *
 * Two cancels: one takes a task out of the queue, one tells a running worker to stop at its next
 * checkpoint. Neither terminates a worker, because a slot is worth more than a task.
 */

import { Pool } from "./pool.ts";
import { fakeWorker } from "./fake.ts";

export async function main(): Promise<number> {
  const fakes = Array.from({ length: 2 }, () => fakeWorker());
  let next = 0;
  const pool = new Pool(2, () => fakes[next++]!.worker);

  const first = pool.run<string>({ id: "running", payload: "a" });
  const queued = pool.run<string>({ id: "queued", payload: "b" });

  const fromQueue = pool.cancel("queued");
  const fromWorker = pool.cancel("running");
  const unknown = pool.cancel("nobody");

  const outcome = await queued.then(() => "resolved", (error: Error) => error.message);
  const firstOutcome = await first.then(() => "resolved", () => "rejected");

  console.log(`cancel queued     ${fromQueue}`);
  console.log(`cancel running    ${fromWorker}`);
  console.log(`cancel unknown    ${unknown}`);
  console.log(`queued outcome    ${outcome}`);
  console.log(`running outcome   ${firstOutcome}`);
  console.log(`workers alive     ${!fakes[0]!.terminated && !fakes[1]!.terminated}`);
  console.log("");
  console.log("a cancel is a message, and a worker that survives it is a worker that can take the next task");

  pool.close();
  return fromQueue && fromWorker && !unknown ? 0 : 1;
}

if (import.meta.main) {
  process.exit(await main());
}
