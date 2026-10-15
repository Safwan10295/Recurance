// Parity tests for lib/text.ts against the Python pipeline. Run: npm test (no network).
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { htmlToText, normForMatch, orgKey, redactTitles, splitSections, stripBoilerplate, verifyQuote, wordingClean } from "../lib/text.ts";

const PAGES = path.join(import.meta.dirname, "..", "..", "tests", "fixtures", "pages");

test("verifyQuote normalises whitespace and typographic quotes", () => {
  assert.ok(verifyQuote("nowhere for the driver of the first   vehicle", "There was nowhere for the driver of the first vehicle to park"));
  assert.ok(verifyQuote("It’s a test of the quote checker", "It's a test of the quote checker here"));
  assert.ok(!verifyQuote("park", "park"));
});

test("orgKey matches the Python key()", () => {
  assert.equal(orgKey("Pennine Care NHS Foundation Trust"), orgKey("Pennine Care NHS Trust"));
  assert.equal(orgKey("Her Majesty's Prison Service"), orgKey("HM Prison Service"));
  assert.equal(orgKey("National Highways"), "national highways");
});

test("sections from a 2013-template page", () => {
  const html = fs.readFileSync(path.join(PAGES, "david-levett-prevention-of-future-deaths-report.html"), "utf-8");
  const flow = html.match(/<div class="flow">([\s\S]*?)<div class="related-content/)![1];
  const sec = splitSections(htmlToText(flow));
  const c = stripBoilerplate(sec.concerns);
  assert.ok(c.startsWith("DURING THE COURSE OF THE INQUEST, EVIDENCE WAS GIVEN"));
  assert.ok(!c.includes("MATTERS OF CONCERN"));
});

test("sections from the new template", () => {
  const html = fs.readFileSync(path.join(PAGES, "pamela-hindley-prevention-of-future-deaths-report.html"), "utf-8");
  const flow = html.match(/<div class="flow">([\s\S]*?)<div class="related-content/)![1];
  const sec = splitSections(htmlToText(flow));
  assert.ok(stripBoilerplate(sec.concerns).startsWith("Rapid discharge events"));
  assert.ok(sec.summary.startsWith("Inadequate social care provision"));
});

test("wording and redaction", () => {
  assert.ok(!wordingClean("The trust ignored the warning"));
  assert.ok(wordingClean("A similar concern was raised again."));
  assert.equal(redactTitles("Dr Smith saw her"), "Dr [name redacted] saw her");
  assert.equal(normForMatch(" a \n b "), "a b");
});
