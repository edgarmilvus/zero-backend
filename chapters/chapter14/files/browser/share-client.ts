/**
 * The page: an owner mints a link, a recipient opens it, and the server never sees the capability.
 *
 * The token lives in the fragment. A fragment is not sent in the request line, so the page can verify
 * a permission the server has never read — which is the chapter's one structural claim about URLs.
 */

import { decodeText, encodeText, mint, type Minted } from "../capability.ts";
import { generateKeyPair } from "../keys.ts";
import { describe } from "../scope.ts";
import { verify, type Verdict } from "../verify.ts";

export type PageState = {
  readonly mode: "owner" | "recipient";
  readonly scope?: string;
  readonly allowed?: boolean;
  readonly reason?: string;
  readonly tokenLength?: number;
  readonly url?: string;
};

const HOUR = 60 * 60 * 1000;

export async function owner(): Promise<PageState> {
  const keys = await generateKeyPair();
  const minted: Minted = await mint(keys, ["read:own", "write:own"], { ttlMs: HOUR });
  const url = `${location.origin}${location.pathname}#cap=${minted.token}`;
  return {
    mode: "owner",
    scope: describe(minted.payload.scope),
    tokenLength: minted.token.length,
    url,
  };
}

export async function recipient(): Promise<PageState> {
  const token = new URLSearchParams(location.hash.slice(1)).get("cap");
  if (!token) return { mode: "recipient", allowed: false, reason: "no capability in the fragment" };

  const verdict: Verdict = await verify(token, { required: ["read:own"] });
  return {
    mode: "recipient",
    allowed: verdict.ok,
    reason: verdict.ok ? "allowed" : verdict.reason,
    scope: verdict.ok ? describe(verdict.payload.scope) : undefined,
    tokenLength: token.length,
  };
}

declare global {
  interface Window {
    __owner: () => Promise<PageState>;
    __recipient: () => Promise<PageState>;
    __openLink: (url: string) => void;
    __tamper: () => Promise<PageState>;
    __lastState?: PageState;
  }
}

if (typeof window !== "undefined") {
  const status = document.querySelector<HTMLParagraphElement>("#status");
  const output = document.querySelector<HTMLPreElement>("#out");
  const buttons = {
    mint: document.querySelector<HTMLButtonElement>("#mint"),
    open: document.querySelector<HTMLButtonElement>("#open"),
    tamper: document.querySelector<HTMLButtonElement>("#tamper"),
    clear: document.querySelector<HTMLButtonElement>("#clear"),
  };
  let current: PageState | null = null;

  const render = (state: PageState): string => {
    window.__lastState = state;
    if (state.mode === "owner") {
      return [
        `mode              owner`,
        `scope             ${state.scope}`,
        `token             ${state.tokenLength} characters`,
        `link              ${state.url?.slice(0, 96)}...`,
        "",
        "the fragment never leaves this tab: look at the network panel, there is no request with it",
      ].join("\n");
    }
    return [
      `mode              recipient`,
      state.allowed ? `verdict           allowed, ${state.scope}` : `verdict           refused, ${state.reason}`,
      `token             ${state.tokenLength ?? 0} characters`,
      "",
      state.allowed ? "the permission travelled in the link, and no server was asked" : "the link is not a permission",
    ].join("\n");
  };

  const run = async (work: () => Promise<PageState>): Promise<void> => {
    if (status) status.textContent = "working...";
    const state = await work();
    current = state;
    if (status) {
      status.textContent =
        state.mode === "owner"
          ? `minted a ${state.tokenLength}-character capability`
          : state.allowed
            ? `allowed: ${state.scope}`
            : `refused: ${state.reason}`;
    }
    if (output) output.textContent = render(state);
  };

  buttons.mint?.addEventListener("click", () => void run(owner));
  buttons.open?.addEventListener("click", () => {
    if (!current?.url) {
      if (status) status.textContent = "mint a link first";
      return;
    }
    location.hash = new URL(current.url).hash;
    void run(recipient);
  });
  buttons.tamper?.addEventListener("click", () => {
    const token = new URLSearchParams(location.hash.slice(1)).get("cap");
    if (!token) {
      if (status) status.textContent = "open a link first";
      return;
    }
    const [body, signature] = token.split(".");
    const payload = JSON.parse(decodeText(body ?? "")) as { scope: string[] };
    payload.scope = ["delete:all"];
    const forged = `${encodeText(JSON.stringify(payload))}.${signature}`;
    location.hash = `cap=${forged}`;
    void run(recipient);
  });
  buttons.clear?.addEventListener("click", () => {
    history.replaceState(null, "", location.pathname);
    if (status) status.textContent = "fragment cleared";
    if (output) output.textContent = "no capability";
  });

  window.__owner = owner;
  window.__recipient = recipient;
  window.__openLink = (url: string) => {
    location.hash = new URL(url).hash;
  };
  window.__tamper = async () => {
    const token = new URLSearchParams(location.hash.slice(1)).get("cap");
    if (!token) throw new Error("no capability");
    const [body, signature] = token.split(".");
    const payload = JSON.parse(decodeText(body ?? "")) as { scope: string[] };
    payload.scope = ["delete:all"];
    location.hash = `cap=${encodeText(JSON.stringify(payload))}.${signature}`;
    return recipient();
  };

  void run(location.hash.includes("cap=") ? recipient : owner);
}
