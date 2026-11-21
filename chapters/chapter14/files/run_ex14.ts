/**
 * Chapter 14 harness: 56 assertions over the scope, the key, the capability and the check.
 *
 * The crypto is real: ECDSA P-256 through WebCrypto, generated in the test process. Nothing here mocks
 * a signature, because a mocked signature proves nothing about the chapter's only security claim.
 */

import { spawnSync } from "node:child_process";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { canonicalValue, decode, mint } from "./capability.ts";
import { exportPublic, generateKeyPair, importPublic, sign, verifyBytes } from "./keys.ts";
import { describe as describeScope, intersect, isSubset, parseScope, parseText, type Scope } from "./scope.ts";
import { assertAllows, assertRefuses, renderCapability, renderVerdict } from "./report.ts";
import { isFresh, verify } from "./verify.ts";

const HERE = dirname(fileURLToPath(import.meta.url));
const HOUR = 60 * 60 * 1000;

type Check = { readonly name: string; readonly run: () => void | boolean | Promise<void | boolean> };
const checks: Check[] = [];
const check = (name: string, run: Check["run"]): void => void checks.push({ name, run });

function expect(condition: boolean, message: string): true {
  if (!condition) throw new Error(message);
  return true;
}
function eq<T>(actual: T, expected: T, what: string): true {
  if (actual !== expected) throw new Error(`${what}: got ${String(actual)}, expected ${String(expected)}`);
  return true;
}
function throwsSync(fn: () => unknown, what: string): Error {
  try {
    fn();
  } catch (error) {
    return error as Error;
  }
  throw new Error(`${what}: nothing was thrown`);
}
async function throwsAsync(fn: () => Promise<unknown>, what: string): Promise<Error> {
  try {
    await fn();
  } catch (error) {
    return error as Error;
  }
  throw new Error(`${what}: nothing was thrown`);
}

// --- the scope ----------------------------------------------------------------

check("a scope is sorted", () => eq(parseScope(["write:own", "read:own"]).join(","), "read:own,write:own", "sorted"));
check("a repeated pair is one pair", () => eq(parseScope(["read:own", "read:own"]).length, 1, "dedupe"));
check("an empty scope is refused", () => expect(throwsSync(() => parseScope([]), "empty").message.includes("at least one"), "message"));
check("a pair without a colon is refused", () => {
  const error = throwsSync(() => parseScope(["read"]), "no colon");
  return expect(error.message.includes("action:resource"), error.message);
});
check("a pair with an empty action is refused", () => expect(throwsSync(() => parseScope([":own"]), "empty action").message.includes("action:resource"), "message"));
check("a scope reads the same as a set", () => eq(parseText("read:own, write:own").join(","), "read:own,write:own", "text"));
check("a subset is allowed", () => eq(isSubset(parseText("read:own"), parseText("read:own,write:own")), true, "subset"));
check("more than the parent is not", () => eq(isSubset(parseText("read:own,write:own"), parseText("read:own")), false, "superset"));
check("write is not inside read, whatever the prefix says", () =>
  eq(isSubset(parseText("write:own"), parseText("read:own")), false, "prefix"),
);
check("read:all is not inside read:own", () => eq(isSubset(parseText("read:all"), parseText("read:own")), false, "resource"));
check("the intersection keeps what both have", () =>
  eq(intersect(parseText("read:own,write:own"), parseText("read:own,delete:all")).join(","), "read:own", "intersection"),
);
check("the intersection can be empty", () => eq(intersect(parseText("read:own"), parseText("write:own")).length, 0, "empty"));
check("an empty scope describes itself", () => eq(describeScope([]), "nothing", "describe"));
check("a scope describes its pairs", () => eq(describeScope(parseText("read:own")), "read:own", "describe"));
check("two scopes with the same pairs are one set", () => {
  const left: Scope = parseScope(["read:own", "write:own"]);
  const right: Scope = parseScope(["write:own", "read:own"]);
  return eq(left.join(","), right.join(","), "order");
});

// --- the keys -----------------------------------------------------------------

const owner = await generateKeyPair();
const stranger = await generateKeyPair();
const ownerPublic = await exportPublic(owner.publicKey);

check("a key pair exports a P-256 public key", () => expect(ownerPublic.length > 80 && ownerPublic.length < 100, `${ownerPublic.length}`));
check("a signature verifies", async () => expect(await verifyBytes(await importPublic(ownerPublic), "hello", await sign(owner.privateKey, "hello")), "verify"));
check("a signature over other bytes does not", async () =>
  expect(!(await verifyBytes(await importPublic(ownerPublic), "hellO", await sign(owner.privateKey, "hello"))), "tamper"),
);
check("another key does not verify it", async () =>
  expect(!(await verifyBytes(stranger.publicKey, "hello", await sign(owner.privateKey, "hello"))), "other key"),
);
check("two key pairs are different", async () => expect(ownerPublic !== (await exportPublic(stranger.publicKey)), "same key"));
check("a malformed public key is refused", async () => {
  const error = await throwsAsync(() => importPublic("not-a-key"), "malformed");
  return expect(error instanceof Error, "no error");
});
check("a signature is base64url", async () => {
  const signature = await sign(owner.privateKey, "x");
  return expect(/^[A-Za-z0-9_-]+$/.test(signature), signature);
});

// --- the capability ------------------------------------------------------------

check("canonical JSON sorts its keys", () =>
  eq(canonicalValue({ b: 1, a: 2 }), '{"a":2,"b":1}', "order"),
);
check("canonical JSON keeps array order", () => eq(canonicalValue([2, 1]), "[2,1]", "arrays"));
check("canonical JSON drops undefined fields", () => eq(canonicalValue({ a: 1, b: undefined }), '{"a":1}', "undefined"));
check("a minted capability has the four fields", async () => {
  const minted = await mint(owner, ["read:own"], { ttlMs: HOUR });
  return eq(Object.keys(minted.payload).sort().join(","), "exp,iss,nonce,scope,v", "fields");
});
check("a token is payload.signature", async () => {
  const minted = await mint(owner, ["read:own"], { ttlMs: HOUR });
  return eq(minted.token.split(".").length, 2, "shape");
});
check("a token decodes to the same payload", async () => {
  const minted = await mint(owner, ["read:own"], { ttlMs: HOUR, nonce: "n1" });
  return eq(decode(minted.token).payload.nonce, "n1", "nonce");
});
check("the signature is over the canonical text", async () => {
  const minted = await mint(owner, ["read:own"], { ttlMs: HOUR });
  return expect(await verifyBytes(owner.publicKey, canonicalValue(minted.payload), minted.signature), "signature");
});
check("a zero ttl is refused", async () => {
  const error = await throwsAsync(() => mint(owner, ["read:own"], { ttlMs: 0 }), "zero");
  return expect(error.message.includes("duration"), error.message);
});
check("a nonce defaults to a fresh one", async () => {
  const first = await mint(owner, ["read:own"], { ttlMs: HOUR });
  const second = await mint(owner, ["read:own"], { ttlMs: HOUR });
  return expect(first.payload.nonce !== second.payload.nonce, "reused nonce");
});
check("decode refuses another version", async () => {
  const minted = await mint(owner, ["read:own"], { ttlMs: HOUR });
  const raw = JSON.parse(Buffer.from(minted.token.split(".")[0] ?? "", "base64url").toString("utf8")) as { v: number };
  raw.v = 2;
  const token = `${Buffer.from(JSON.stringify(raw)).toString("base64url")}.${minted.token.split(".")[1]}`;
  const error = throwsSync(() => decode(token), "version");
  return expect(error.message.includes("not supported"), error.message);
});
check("decode refuses a short issuer", async () => {
  const minted = await mint(owner, ["read:own"], { ttlMs: HOUR });
  const raw = JSON.parse(Buffer.from(minted.token.split(".")[0] ?? "", "base64url").toString("utf8")) as { iss: string };
  raw.iss = "abc";
  const token = `${Buffer.from(JSON.stringify(raw)).toString("base64url")}.${minted.token.split(".")[1]}`;
  return expect(throwsSync(() => decode(token), "iss").message.includes("public key"), "message");
});
check("decode refuses a text expiry", async () => {
  const minted = await mint(owner, ["read:own"], { ttlMs: HOUR });
  const raw = JSON.parse(Buffer.from(minted.token.split(".")[0] ?? "", "base64url").toString("utf8")) as { exp: unknown };
  raw.exp = "tomorrow";
  const token = `${Buffer.from(JSON.stringify(raw)).toString("base64url")}.${minted.token.split(".")[1]}`;
  return expect(throwsSync(() => decode(token), "exp").message.includes("epoch"), "message");
});
check("decode refuses an empty scope", async () => {
  const minted = await mint(owner, ["read:own"], { ttlMs: HOUR });
  const raw = JSON.parse(Buffer.from(minted.token.split(".")[0] ?? "", "base64url").toString("utf8")) as { scope: string[] };
  raw.scope = [];
  const token = `${Buffer.from(JSON.stringify(raw)).toString("base64url")}.${minted.token.split(".")[1]}`;
  return expect(throwsSync(() => decode(token), "scope").message.includes("at least one"), "message");
});

// --- the check ----------------------------------------------------------------

check("a valid capability is allowed", async () => {
  const minted = await mint(owner, ["read:own"], { ttlMs: HOUR, now: 0 });
  return expect((await verify(minted.token, { now: 1 })).ok, "refused");
});
check("the required scope is checked", async () => {
  const minted = await mint(owner, ["read:own"], { ttlMs: HOUR, now: 0 });
  return expect(!(await verify(minted.token, { now: 1, required: ["write:own"] })).ok, "allowed");
});
check("a scope that contains the requirement is allowed", async () => {
  const minted = await mint(owner, ["read:own", "write:own"], { ttlMs: HOUR, now: 0 });
  return expect((await verify(minted.token, { now: 1, required: ["read:own"] })).ok, "refused");
});
check("an expired capability is refused", async () => {
  const minted = await mint(owner, ["read:own"], { ttlMs: 10, now: 0 });
  const verdict = await verify(minted.token, { now: 10 });
  return expect(!verdict.ok && verdict.reason.includes("expired"), verdict.ok ? "allowed" : verdict.reason);
});
check("the rejection names the instant", async () => {
  const minted = await mint(owner, ["read:own"], { ttlMs: 10, now: 0 });
  const verdict = await verify(minted.token, { now: 11 });
  return expect(!verdict.ok && /T\d\d:\d\d/.test(verdict.reason), verdict.ok ? "allowed" : verdict.reason);
});
check("a forged scope is refused by the signature", async () => {
  const minted = await mint(owner, ["read:own"], { ttlMs: HOUR, now: 0 });
  const [body, signature] = minted.token.split(".");
  const raw = JSON.parse(Buffer.from(body ?? "", "base64url").toString("utf8")) as { scope: string[] };
  raw.scope = ["delete:all"];
  const token = `${Buffer.from(JSON.stringify(raw)).toString("base64url")}.${signature}`;
  const verdict = await verify(token, { now: 1 });
  return expect(!verdict.ok && verdict.reason.includes("signature"), verdict.ok ? "allowed" : verdict.reason);
});
check("another issuer is refused by the signature", async () => {
  const minted = await mint(owner, ["read:own"], { ttlMs: HOUR, now: 0 });
  const [body, signature] = minted.token.split(".");
  const raw = JSON.parse(Buffer.from(body ?? "", "base64url").toString("utf8")) as { iss: string };
  raw.iss = await exportPublic(stranger.publicKey);
  const token = `${Buffer.from(JSON.stringify(raw)).toString("base64url")}.${signature}`;
  const verdict = await verify(token, { now: 1 });
  return expect(!verdict.ok && verdict.reason.includes("signature"), verdict.ok ? "allowed" : verdict.reason);
});
check("a truncated signature is refused", async () => {
  const minted = await mint(owner, ["read:own"], { ttlMs: HOUR, now: 0 });
  const [body, signature] = minted.token.split(".");
  const verdict = await verify(`${body}.${(signature ?? "").slice(0, 10)}`, { now: 1 });
  return expect(!verdict.ok, "allowed");
});
check("a malformed token is a verdict, not a throw", async () => {
  const verdict = await verify("not-a-token", { now: 1 });
  return expect(!verdict.ok && verdict.reason.includes("malformed"), verdict.ok ? "allowed" : verdict.reason);
});
check("isFresh is true one millisecond before expiry", async () => {
  const minted = await mint(owner, ["read:own"], { ttlMs: 100, now: 0 });
  return expect(isFresh(minted.payload, 99) && !isFresh(minted.payload, 100), "edge");
});
check("an empty requirement allows any valid capability", async () => {
  const minted = await mint(owner, ["read:own"], { ttlMs: HOUR, now: 0 });
  return expect((await verify(minted.token, { now: 1, required: [] })).ok, "refused");
});
check("the verdict carries the payload on success", async () => {
  const minted = await mint(owner, ["read:own"], { ttlMs: HOUR, now: 0 });
  const verdict = await verify(minted.token, { now: 1 });
  return expect(verdict.ok && verdict.payload.nonce === minted.payload.nonce, "payload");
});

// --- the report ---------------------------------------------------------------

check("the rendering names the scope and the life", async () => {
  const minted = await mint(owner, ["read:own"], { ttlMs: HOUR, now: 0 });
  const text = renderCapability(minted.payload, 0);
  return expect(text.includes("read:own") && text.includes("60 minute"), text);
});
check("a verdict renders as allowed or refused", async () => {
  const minted = await mint(owner, ["read:own"], { ttlMs: HOUR, now: 0 });
  const allowed = renderVerdict(await verify(minted.token, { now: 1 }));
  const refused = renderVerdict(await verify("x", { now: 1 }));
  return expect(allowed.startsWith("allowed") && refused.startsWith("refused"), `${allowed} / ${refused}`);
});
check("assertAllows throws on a refusal", () => {
  const error = throwsSync(() => assertAllows({ ok: false, reason: "expired" }), "refusal");
  return expect(error.message.includes("expired"), error.message);
});
check("assertRefuses wants the right fragment", () => {
  const error = throwsSync(() => assertRefuses({ ok: false, reason: "expired" }, "signature"), "fragment");
  return expect(error.message.includes("signature"), error.message);
});

// --- the programs -------------------------------------------------------------

const run = (script: string) => spawnSync(process.execPath, [join(HERE, script)], { encoding: "utf8", timeout: 120_000 });

check("01 mints, verifies and refuses a forgery", () => {
  const result = run("01_mint.ts");
  eq(result.status ?? -1, 0, `exit ${result.status} ${result.stderr}`);
  return expect(result.stdout.includes("signature: does not match"), result.stdout.slice(-160));
});
check("02 refuses the case the prefix check gets wrong", () => {
  const result = run("02_scope.ts");
  eq(result.status ?? -1, 0, `exit ${result.status} ${result.stderr}`);
  return expect(result.stdout.includes("5/5 cases"), result.stdout);
});
check("03 refuses at the exact expiry instant", () => {
  const result = run("03_expiry.ts");
  eq(result.status ?? -1, 0, `exit ${result.status} ${result.stderr}`);
  return expect(result.stdout.includes("fresh at t+1h:    false"), result.stdout);
});
check("04 refuses three forgeries", () => {
  const result = run("04_tamper.ts");
  eq(result.status ?? -1, 0, `exit ${result.status} ${result.stderr}`);
  return expect(result.stdout.includes("3 forgeries refused"), result.stdout.slice(-160));
});
check("05 refuses a delegation wider than the parent", () => {
  const result = run("05_delegate.ts");
  eq(result.status ?? -1, 0, `exit ${result.status} ${result.stderr}`);
  return expect(result.stdout.includes("is not inside the parent"), result.stdout.slice(-200));
});

// --- run ----------------------------------------------------------------------

async function main(): Promise<number> {
  if (checks.length !== 56) {
    console.error(`harness has ${checks.length} checks, the contract promises 56`);
    return 1;
  }
  let passed = 0;
  for (const [index, entry] of checks.entries()) {
    try {
      const ok = await entry.run();
      if (ok === false) throw new Error("returned false");
      passed += 1;
      console.log(`ok   ${String(index + 1).padStart(2, "0")}  ${entry.name}`);
    } catch (error) {
      console.log(`FAIL ${String(index + 1).padStart(2, "0")}  ${entry.name}`);
      console.log(`           ${(error as Error).message}`);
    }
  }
  console.log("");
  console.log(`${passed}/${checks.length} checks passed`);
  return passed === checks.length ? 0 : 1;
}

process.exit(await main());
