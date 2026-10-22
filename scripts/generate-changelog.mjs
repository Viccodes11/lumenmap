#!/usr/bin/env node

import { execFileSync } from "node:child_process";
import { readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

const START_MARKER = "<!-- changelog:generated:start -->";
const END_MARKER = "<!-- changelog:generated:end -->";
const SUPPORTED_TYPES = new Map([
  ["feat", "Added"],
  ["fix", "Fixed"],
  ["docs", "Documentation"],
]);
const SAFE_REF = /^[A-Za-z0-9][A-Za-z0-9._/~^{}-]*$/;

export function parseConventionalCommits(commits) {
  return commits.flatMap((commit) => {
    const match = /^(feat|fix|docs)(?:\(([^)]+)\))?(!)?:\s+(.+)$/.exec(
      commit.subject.trim(),
    );
    if (!match) return [];

    const [, type, scope, breaking, summary] = match;
    return [
      {
        sha: commit.sha,
        type,
        scope: scope?.trim() || null,
        breaking: Boolean(breaking),
        summary: summary.trim(),
      },
    ];
  });
}

function commitLink(repoUrl, sha) {
  const cleanRepo = repoUrl.replace(/\.git$/, "").replace(/\/$/, "");
  return `[${sha.slice(0, 7)}](${cleanRepo}/commit/${sha})`;
}

function bulletFor(commit, repoUrl) {
  const scope = commit.scope ? `**${commit.scope}:** ` : "";
  const breaking = commit.breaking ? " **Breaking:**" : "";
  return `- ${scope}${commit.summary}${breaking} (${commitLink(repoUrl, commit.sha)})`;
}

export function renderGeneratedSections(commits, repoUrl) {
  const parsed = parseConventionalCommits(commits);
  const sections = [];

  for (const [type, heading] of SUPPORTED_TYPES) {
    const entries = parsed.filter((commit) => commit.type === type);
    if (!entries.length) continue;
    sections.push(`### ${heading}\n\n${entries.map((entry) => bulletFor(entry, repoUrl)).join("\n")}`);
  }

  return sections.length
    ? sections.join("\n\n")
    : "_No user-facing feature, fix, or documentation changes in this range._";
}

export function replaceGeneratedSection(changelog, generated) {
  const start = changelog.indexOf(START_MARKER);
  const end = changelog.indexOf(END_MARKER);
  if (start === -1 || end === -1 || end < start) {
    throw new Error("CHANGELOG.md is missing the generated-section markers");
  }

  const before = changelog.slice(0, start + START_MARKER.length);
  const after = changelog.slice(end);
  return `${before}\n${generated.trim()}\n${after}`;
}

function verifyRef(ref) {
  if (!SAFE_REF.test(ref)) {
    throw new Error(`Invalid Git ref: ${ref}`);
  }
  execFileSync("git", ["rev-parse", "--verify", `${ref}^{commit}`], {
    stdio: "ignore",
  });
}

export function commitsFromGitRange(from, to = "HEAD") {
  verifyRef(from);
  verifyRef(to);
  const output = execFileSync(
    "git",
    [
      "log",
      "--no-merges",
      "--reverse",
      "--format=%H%x1f%s%x1e",
      `${from}..${to}`,
      "--",
    ],
    { encoding: "utf8", maxBuffer: 5 * 1024 * 1024 },
  );

  return output
    .split("\x1e")
    .map((record) => record.trim())
    .filter(Boolean)
    .map((record) => {
      const [sha, subject] = record.split("\x1f");
      return { sha, subject };
    });
}

function parseArgs(argv) {
  const options = { to: "HEAD", write: false, fixture: null };
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === "--write") options.write = true;
    else if (["--from", "--to", "--repo-url", "--fixture"].includes(arg)) {
      const value = argv[index + 1];
      if (!value) throw new Error(`${arg} requires a value`);
      options[arg.slice(2).replace("repo-url", "repoUrl")] = value;
      index += 1;
    } else {
      throw new Error(`Unknown argument: ${arg}`);
    }
  }
  if (!options.fixture && !options.from) {
    throw new Error("Provide --from <git-ref> or --fixture <json-file>");
  }
  return options;
}

function repositoryUrl() {
  const packageJson = JSON.parse(readFileSync("package.json", "utf8"));
  return typeof packageJson.repository === "string"
    ? packageJson.repository
    : packageJson.repository.url;
}

function main(argv) {
  const options = parseArgs(argv);
  const commits = options.fixture
    ? JSON.parse(readFileSync(resolve(options.fixture), "utf8"))
    : commitsFromGitRange(options.from, options.to);
  const generated = renderGeneratedSections(
    commits,
    options.repoUrl ?? repositoryUrl(),
  );

  if (!options.write) {
    process.stdout.write(`${generated}\n`);
    return;
  }

  const path = resolve("CHANGELOG.md");
  const updated = replaceGeneratedSection(readFileSync(path, "utf8"), generated);
  writeFileSync(path, updated);
  process.stdout.write(`Updated ${path} from ${commits.length} commit(s).\n`);
}

if (process.argv[1] && fileURLToPath(import.meta.url) === resolve(process.argv[1])) {
  try {
    main(process.argv.slice(2));
  } catch (error) {
    console.error(`changelog: ${error.message}`);
    process.exitCode = 1;
  }
}
