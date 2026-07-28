import assert from "node:assert/strict";
import test from "node:test";

import {
  isBrowserUnreachableApiBase,
  isSiblingSubdomainApiBase,
  shouldPreferSameOriginApiBase,
} from "../lib/config.js";

const APP = "https://app.enfantorganic.com/api";

// ─── the change this exists for ──────────────────────────────────────────────
// Pages are served from om|ae|sa.enfantorganic.com while the configured API
// base points at app.enfantorganic.com — a sibling subdomain. That costs a
// second DNS + TCP + TLS setup per visitor for a backend the page's own origin
// already proxies at /api.

for (const host of ["om.enfantorganic.com", "ae.enfantorganic.com", "sa.enfantorganic.com"]) {
  test(`${host} collapses the sibling API host to same-origin`, () => {
    assert.equal(isSiblingSubdomainApiBase(APP, host), true);
    assert.equal(shouldPreferSameOriginApiBase(APP, host), true);
  });
}

test("www and the apex collapse too", () => {
  assert.equal(shouldPreferSameOriginApiBase(APP, "www.enfantorganic.com"), true);
  assert.equal(shouldPreferSameOriginApiBase(APP, "enfantorganic.com"), true);
});

// ─── must NOT rewrite ────────────────────────────────────────────────────────

test("a genuinely separate backend domain is left alone", () => {
  assert.equal(isSiblingSubdomainApiBase("https://api.some-other-host.net/api", "om.enfantorganic.com"), false);
  assert.equal(shouldPreferSameOriginApiBase("https://api.some-other-host.net/api", "om.enfantorganic.com"), false);
});

test("an API already on the page's own host is not rewritten", () => {
  assert.equal(isSiblingSubdomainApiBase("https://om.enfantorganic.com/api", "om.enfantorganic.com"), false);
});

test("an already-relative base is untouched", () => {
  assert.equal(isSiblingSubdomainApiBase("/api", "om.enfantorganic.com"), false);
});

test("local development is never rewritten", () => {
  for (const host of ["localhost", "127.0.0.1", "0.0.0.0"]) {
    assert.equal(isSiblingSubdomainApiBase(APP, host), false, host);
    assert.equal(shouldPreferSameOriginApiBase("http://127.0.0.1:8000/api", host), false, host);
  }
});

test("empty or malformed input never triggers a rewrite", () => {
  assert.equal(isSiblingSubdomainApiBase("", "om.enfantorganic.com"), false);
  assert.equal(isSiblingSubdomainApiBase(APP, ""), false);
  assert.equal(isSiblingSubdomainApiBase("not a url", "om.enfantorganic.com"), false);
  assert.equal(isSiblingSubdomainApiBase(APP, "singlelabel"), false);
});

// ─── the pre-existing unreachable-host guard must still work ─────────────────

test("non-browser-reachable hosts still fall back to same-origin", () => {
  for (const bad of ["http://backend:8000/api", "http://localhost:8000/api", "http://127.0.0.1:8000/api"]) {
    assert.equal(isBrowserUnreachableApiBase(bad), true, bad);
    assert.equal(shouldPreferSameOriginApiBase(bad, "om.enfantorganic.com"), true, bad);
  }
});

test("a public API host is not treated as unreachable", () => {
  assert.equal(isBrowserUnreachableApiBase(APP), false);
});

// ─── the exported constant, resolved as it is at module load ─────────────────
// API_BASE_URL is computed once when lib/config.js is imported, so these load
// the module fresh under a simulated browser to prove what the app actually
// gets — not just what the predicate returns.

async function resolveUnder({ hostname, envValue }) {
  const prevWindow = globalThis.window;
  const prevEnv = process.env.NEXT_PUBLIC_API_BASE_URL;
  globalThis.window = { location: { hostname, origin: `https://${hostname}` } };
  if (envValue === undefined) delete process.env.NEXT_PUBLIC_API_BASE_URL;
  else process.env.NEXT_PUBLIC_API_BASE_URL = envValue;
  try {
    const mod = await import(`../lib/config.js?probe=${encodeURIComponent(hostname + "|" + envValue)}`);
    return mod.API_BASE_URL;
  } finally {
    if (prevWindow === undefined) delete globalThis.window;
    else globalThis.window = prevWindow;
    if (prevEnv === undefined) delete process.env.NEXT_PUBLIC_API_BASE_URL;
    else process.env.NEXT_PUBLIC_API_BASE_URL = prevEnv;
  }
}

for (const hostname of ["om.enfantorganic.com", "ae.enfantorganic.com", "sa.enfantorganic.com"]) {
  test(`API_BASE_URL is same-origin on ${hostname}`, async () => {
    assert.equal(await resolveUnder({ hostname, envValue: APP }), "/api");
  });
}

test("API_BASE_URL keeps an absolute base on a genuinely separate domain", async () => {
  const v = "https://api.some-other-host.net/api";
  assert.equal(await resolveUnder({ hostname: "om.enfantorganic.com", envValue: v }), v);
});

test("API_BASE_URL falls back to same-origin when the env value is missing", async () => {
  assert.equal(await resolveUnder({ hostname: "om.enfantorganic.com", envValue: undefined }), "/api");
});
