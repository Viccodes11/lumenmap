#!/usr/bin/env node
// Creates the size:S / size:M / size:L labels (if missing) and backfills them
// onto the newest batch of open "Stellar Wave" issues, per the sizing guide in
// CONTRIBUTING.md#issue-sizing-wave-estimate-guide.
//
// This repo's bot/CI token only has `repo` scope, not org Administration:write,
// so creating labels and editing issues requires a maintainer's own
// GITHUB_TOKEN/GH_TOKEN (needs `issues:write` on lumenmap/lumenmap). Run:
//
//   GITHUB_TOKEN=<token> node scripts/backfill-wave-size-labels.mjs
//   node scripts/backfill-wave-size-labels.mjs --dry-run   # no token needed, prints the plan
//
// The sizing below is a one-time editorial judgment call made when this
// script was authored (see CONTRIBUTING.md for what S/M/L mean); it is not
// recomputed from the issue body, so re-running this script is a no-op once
// the labels are applied (PATCH is idempotent). Extend BACKFILL_PLAN for
// future batches rather than trying to infer size automatically — this repo
// intentionally has no automated/ML sizing.

const owner = process.env.GITHUB_OWNER ?? "lumenmap";
const repo = process.env.GITHUB_REPO ?? "lumenmap";
const token = process.env.GITHUB_TOKEN ?? process.env.GH_TOKEN;
const apiVersion = process.env.GITHUB_API_VERSION ?? "2026-03-10";
const dryRun = process.argv.includes("--dry-run");

const SIZE_LABELS = [
  {
    name: "size:S",
    color: "c2e0c6",
    description: "Small: a handful of files, no BigQuery schema change, minimal a11y surface",
  },
  {
    name: "size:M",
    color: "fef2c0",
    description: "Medium: a new component or route plus tests and docs, moderate a11y surface",
  },
  {
    name: "size:L",
    color: "f9d0c4",
    description: "Large: new subsystem/infra, BigQuery or data-pipeline work, or broad a11y/testing surface",
  },
];

// Newest batch of open "Stellar Wave" issues at the time this script was
// written, sized per the guide in CONTRIBUTING.md. `why` is the judgment call
// a maintainer can sanity-check or overrule.
const BACKFILL_PLAN = [
  { issue: 473, size: "size:S", why: "Meta/docs + labels only, no code path." },
  { issue: 472, size: "size:M", why: "Export-time theme toggle + CSS tokens + one fixture assertion." },
  { issue: 471, size: "size:L", why: "New aggregation + clustering methodology + CSV export + unit tests." },
  { issue: 470, size: "size:M", why: "One new chart component + ranking helper + unit tests." },
  { issue: 469, size: "size:M", why: "One dialog component (share + QR) + encoding test." },
  { issue: 468, size: "size:S", why: "Single parser helper + docs + unit tests, no UI." },
  { issue: 467, size: "size:L", why: "New Playwright visual-regression project, two routes, two viewports, flake stabilization." },
  { issue: 466, size: "size:M", why: "Generator script + CONTRIBUTING docs + seed CHANGELOG." },
  { issue: 465, size: "size:L", why: "New build tool (Storybook) wired into the repo, 6+ stories, optional CI job." },
  { issue: 464, size: "size:M", why: "Health-driven banner component + debounce logic + state-matrix tests." },
];

async function githubRequest(path, init = {}) {
  const response = await fetch(`https://api.github.com${path}`, {
    ...init,
    headers: {
      Accept: "application/vnd.github+json",
      Authorization: `Bearer ${token}`,
      "X-GitHub-Api-Version": apiVersion,
      ...(init.body ? { "Content-Type": "application/json" } : {}),
      ...init.headers,
    },
  });
  if (!response.ok && response.status !== 404) {
    const body = await response.text();
    throw new Error(`${init.method ?? "GET"} ${path} -> HTTP ${response.status}: ${body}`);
  }
  return response;
}

async function ensureLabel(label) {
  if (dryRun) {
    console.log(`[dry-run] ensure label ${label.name} (#${label.color}) exists`);
    return;
  }
  const existing = await githubRequest(`/repos/${owner}/${repo}/labels/${encodeURIComponent(label.name)}`);
  if (existing.status === 404) {
    await githubRequest(`/repos/${owner}/${repo}/labels`, {
      method: "POST",
      body: JSON.stringify(label),
    });
    console.log(`created label ${label.name}`);
  } else {
    console.log(`label ${label.name} already exists`);
  }
}

async function applySizeLabel({ issue, size, why }) {
  if (dryRun) {
    console.log(`[dry-run] add ${size} to #${issue} (${why})`);
    return;
  }
  await githubRequest(`/repos/${owner}/${repo}/issues/${issue}/labels`, {
    method: "POST",
    body: JSON.stringify({ labels: [size] }),
  });
  console.log(`labeled #${issue} ${size}`);
}

async function main() {
  if (!token && !dryRun) {
    console.error("Set GITHUB_TOKEN or GH_TOKEN with issues:write on lumenmap/lumenmap, or pass --dry-run.");
    process.exit(1);
  }

  for (const label of SIZE_LABELS) {
    await ensureLabel(label);
  }
  for (const entry of BACKFILL_PLAN) {
    await applySizeLabel(entry);
  }

  console.log(`\nDone. ${BACKFILL_PLAN.length} issues sized (${dryRun ? "dry run" : "live"}).`);
}

main().catch((error) => {
  console.error(error.message);
  process.exit(1);
});
