import assert from "node:assert/strict";
import test, { beforeEach } from "node:test";

import { getFbc } from "../lib/metaCapi.js";

// getFbc reads the DOM directly, so stand up just enough of it. Each test sets
// the URL and cookie it needs; storage persists across a test unless cleared.
function stubBrowser({ search = "", cookie = "" } = {}) {
  const store = new Map();
  globalThis.window = {
    location: { search },
    localStorage: {
      getItem: (key) => (store.has(key) ? store.get(key) : null),
      setItem: (key, value) => store.set(key, String(value)),
    },
  };
  globalThis.document = { cookie };
  return store;
}

const FBCLID = "IwAR2AbCdEf-GhIjKl_MnOpQrStUvWxYz0123456789";

beforeEach(() => {
  delete globalThis.window;
  delete globalThis.document;
});

test("the Pixel's own _fbc cookie wins when present", () => {
  stubBrowser({ search: `?fbclid=${FBCLID}`, cookie: "_fbp=fb.1.1.2; _fbc=fb.1.999.REAL" });
  assert.equal(getFbc(), "fb.1.999.REAL");
});

test("a landing fbclid is formatted the way Meta specifies", () => {
  stubBrowser({ search: `?utm_source=fb&fbclid=${FBCLID}` });
  const fbc = getFbc();
  assert.match(fbc, /^fb\.1\.\d+\./);
  assert.equal(fbc.split(".").slice(3).join("."), FBCLID);
});

test("the same click yields the same fbc on later events", () => {
  // The bug this guards: rebuilding from Date.now() per event gave one click
  // several fbc values, which Meta reports as a modified fbclid.
  stubBrowser({ search: `?fbclid=${FBCLID}` });
  const first = getFbc();
  const second = getFbc();
  assert.equal(first, second);
});

test("the click survives navigation away from the landing URL", () => {
  const store = stubBrowser({ search: `?fbclid=${FBCLID}` });
  const landing = getFbc();

  // Deeper in the funnel the parameter is gone, but the click is not.
  globalThis.window.location.search = "";
  assert.equal(getFbc(), landing);
  assert.ok(store.size > 0);
});

test("a fresh click replaces the remembered one", () => {
  stubBrowser({ search: `?fbclid=${FBCLID}` });
  const first = getFbc();

  globalThis.window.location.search = "?fbclid=IwAR9-SecondClick_Value";
  const second = getFbc();
  assert.notEqual(second, first);
  assert.equal(second.split(".").slice(3).join("."), "IwAR9-SecondClick_Value");
});

test("the raw fbclid is preserved, not URL-decoded", () => {
  // URLSearchParams would turn "+" into a space and decode %2B; Meta compares
  // the value byte-for-byte against the click id it issued.
  const raw = "IwAR+Plus%2BEncoded";
  stubBrowser({ search: `?fbclid=${raw}` });
  assert.equal(getFbc().split(".").slice(3).join("."), raw);
});

test("no click and no cookie means no fbc rather than a fabricated one", () => {
  stubBrowser({ search: "?utm_source=newsletter" });
  assert.equal(getFbc(), "");
});
