import assert from "node:assert/strict";
import test from "node:test";

import { sanitizeHtml } from "../lib/safeHtml.js";

// ─── formatting styles survive on any allowed tag ────────────────────────────
// The admin rich-text editor (execCommand) writes un-bold overrides as inline
// styles on whatever element wraps the selection — <font>, <h2>, <em>, not
// just <span>/<p>. Stripping them made "remove bold" silently not stick.

test("font-weight override on <font> inside <h2> survives", () => {
  const out = sanitizeHtml('<h2><font size="3" style="font-weight:normal">Body text</font></h2>');
  assert.match(out, /font-weight: normal/);
  assert.match(out, /size="3"/);
});

test("font-weight/font-size override on <span> survives", () => {
  const out = sanitizeHtml('<h2><span style="font-weight:normal;font-size:medium">نساعد الآباء</span></h2>');
  assert.match(out, /font-weight: normal/);
  assert.match(out, /font-size: medium/);
});

test("font-size on <em> survives", () => {
  const out = sanitizeHtml('<p><em style="font-size:0.9rem">tagline</em></p>');
  assert.match(out, /font-size: 0.9rem/);
});

// ─── non-whitelisted / dangerous styles are still stripped ───────────────────

test("url() and expression() style values are dropped", () => {
  const out = sanitizeHtml('<span style="background:url(javascript:alert(1));font-weight:bold">x</span>');
  assert.equal(out, '<span style="font-weight: bold">x</span>');
  const out2 = sanitizeHtml('<font size="3" style="color:expression(alert(1))">x</font>');
  assert.equal(out2, '<font size="3">x</font>');
});

test("non-whitelisted style properties are dropped", () => {
  const out = sanitizeHtml('<span style="position:fixed;top:0;font-style:italic">x</span>');
  assert.equal(out, '<span style="font-style: italic">x</span>');
});

test("disallowed tags and event handlers are still removed", () => {
  assert.equal(sanitizeHtml("<img src=x onerror=alert(1)>"), "");
  const out = sanitizeHtml('<a href="javascript:alert(1)" onclick="x()" style="font-weight:bold">x</a>');
  assert.ok(!/javascript:|onclick/.test(out));
});
