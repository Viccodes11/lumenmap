import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import {
  parseConventionalCommits,
  renderGeneratedSections,
  replaceGeneratedSection,
} from "./generate-changelog.mjs";

const fixture = JSON.parse(
  readFileSync(new URL("./fixtures/changelog-commits.json", import.meta.url), "utf8"),
);
const repo = "https://github.com/lumenmap/lumenmap";

test("parses feat, fix and docs commits while ignoring maintenance commits", () => {
  const parsed = parseConventionalCommits(fixture);
  assert.deepEqual(
    parsed.map(({ type, scope }) => [type, scope]),
    [
      ["feat", "api"],
      ["fix", "ui"],
      ["docs", "methodology"],
    ],
  );
});

test("renders deterministic Keep a Changelog sections and commit links", () => {
  const first = renderGeneratedSections(fixture, repo);
  const second = renderGeneratedSections(fixture, `${repo}.git`);

  assert.equal(first, second);
  assert.match(first, /^### Added/m);
  assert.match(first, /^### Fixed/m);
  assert.match(first, /^### Documentation/m);
  assert.match(first, /\[1111111\]\(https:\/\/github\.com\/lumenmap\/lumenmap\/commit\/1111/);
  assert.doesNotMatch(first, /refresh local fixtures/);
});

test("replaces only the generated section and remains idempotent", () => {
  const source = `# Changelog\n\n## [Unreleased]\n\n<!-- changelog:generated:start -->\nold\n<!-- changelog:generated:end -->\n\n## [0.1.0]\n`;
  const generated = renderGeneratedSections(fixture, repo);
  const once = replaceGeneratedSection(source, generated);
  const twice = replaceGeneratedSection(once, generated);

  assert.equal(once, twice);
  assert.match(once, /## \[0\.1\.0\]/);
  assert.doesNotMatch(once, /\nold\n/);
});

test("fails clearly when the generated markers are absent", () => {
  assert.throws(
    () => replaceGeneratedSection("# Changelog\n", "generated"),
    /missing the generated-section markers/,
  );
});
