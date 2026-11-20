/**
 * The probe, in the page, on the machine in front of the reader.
 *
 * It imports the same two files the harness tests, because a browser probe that is a copy
 * of the node probe is a second implementation with a second set of bugs. The page reports
 * the profile, offers it as a file, and exposes `window.__profile()` so a recording script
 * can drive the exact code path a reader drives.
 */

import { detectCapabilities } from "../detect.ts";
import type { CapabilityId } from "../capabilities.ts";
import { probe, type Capabilities, type Profile } from "../probe.ts";
import { renderJson, renderMarkdown, renderTable } from "../report.ts";

export type PageProfile = {
  readonly profile: Profile;
  readonly json: string;
  readonly isolated: boolean;
};

/**
 * Some capabilities are only exposed inside a worker.
 *
 * `FileSystemFileHandle.createSyncAccessHandle` is `[Exposed=DedicatedWorker]`: on the main
 * thread the property does not exist, so a main-thread probe reports it absent on a browser
 * that has it. The probe therefore runs twice, and the second pass is the reason this
 * chapter has a worker in it at all.
 */
const WORKER_ONLY = `
self.onmessage = () => {
  const out = {};
  try {
    out["opfs-sync"] =
      typeof FileSystemFileHandle !== "undefined" &&
      typeof FileSystemFileHandle.prototype.createSyncAccessHandle === "function";
  } catch {
    out["opfs-sync"] = false;
  }
  try {
    out["shared-array-buffer"] = typeof SharedArrayBuffer !== "undefined";
  } catch {
    out["shared-array-buffer"] = false;
  }
  self.postMessage(out);
};
`;

async function probeInWorker(): Promise<{
  present: Partial<Record<CapabilityId, boolean>>;
  sharedArrayBuffer: boolean;
}> {
  const url = URL.createObjectURL(new Blob([WORKER_ONLY], { type: "text/javascript" }));
  const worker = new Worker(url);
  try {
    const answer = await new Promise<Record<string, boolean>>((resolve, reject) => {
      worker.onmessage = (event: MessageEvent) => resolve(event.data as Record<string, boolean>);
      worker.onerror = (event) => reject(new Error(event.message));
      worker.postMessage({});
    });
    return {
      present: { "opfs-sync": answer["opfs-sync"] === true },
      sharedArrayBuffer: answer["shared-array-buffer"] === true,
    };
  } finally {
    worker.terminate();
    URL.revokeObjectURL(url);
  }
}

export async function profileHere(): Promise<PageProfile> {
  const main = detectCapabilities();

  let caps: Capabilities = main;
  try {
    const inWorker = await probeInWorker();
    caps = {
      crossOriginIsolated: main.crossOriginIsolated,
      sharedArrayBuffer: main.sharedArrayBuffer || inWorker.sharedArrayBuffer,
      present: { ...main.present, ...inWorker.present },
    };
  } catch {
    // A page that cannot start a worker has bigger problems; the main-thread answer stands.
  }

  const profile = probe(caps);
  const json = renderJson(profile, {
    measuredAt: new Date().toISOString(),
    engine: `chrome ${navigator.userAgent.match(/Chrome\/(\d+)/)?.[1] ?? "unknown"}`,
    crossOriginIsolated: caps.crossOriginIsolated,
    userAgent: navigator.userAgent,
  });
  return { profile, json, isolated: caps.crossOriginIsolated };
}

declare global {
  interface Window {
    __profile: () => Promise<PageProfile>;
  }
}

if (typeof window !== "undefined") {
  const output = document.querySelector<HTMLPreElement>("#out");
  const summary = document.querySelector<HTMLParagraphElement>("#summary");

  window.__profile = profileHere;

  const { profile, json, isolated } = await profileHere();

  if (summary) {
    summary.textContent = `tier ${profile.tier} of 3, ${
      profile.blockedChapters.length
    } chapters degrade, cross-origin isolated: ${isolated}`;
  }

  if (output) {
    output.textContent = `${renderTable(profile)}\n\n${renderMarkdown(profile)}`;
  }

  const download = document.querySelector<HTMLButtonElement>("#download");
  download?.addEventListener("click", () => {
    const blob = new Blob([json], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = "profile.json";
    anchor.click();
    URL.revokeObjectURL(url);
  });
}
