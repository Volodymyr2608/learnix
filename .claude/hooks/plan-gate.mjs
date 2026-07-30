#!/usr/bin/env node

// Plan gate (ADR-021): blocks Write/Edit to source dirs unless an approved-plan marker
// (`.claude/.active-plan`) exists for the current branch. The marker is created by `/implement`
// (after an approved build/plan.md) or by `/spec` on a trivial fix. This makes "no code before an
// approved plan" structural, not just a convention.
//
// Wired via PreToolUse in .claude/settings.json. Exit 0 = allow, exit 2 = block (stderr → Claude).
// Fails OPEN on any internal error so a hook bug never bricks a session. Escape hatch: PLAN_GATE_OFF=1.

import { execSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { relative, resolve } from "node:path";

const ALLOW = 0;
const BLOCK = 2;

// Always-writable: the workflow's own artifacts and config — never gated.
const ALLOW_PREFIXES = ["docs/", ".claude/", ".husky/", "evals/"];
// Gated source zones — edits here require the marker.
const GATED_PREFIXES = [
	"app/",
	"server/",
	"lib/",
	"trpc/",
	"prisma/",
	"scripts/",
	"src/",
	"components/",
	"hooks/",
];

const readStdin = () => {
	try {
		return readFileSync(0, "utf8");
	} catch {
		return "";
	}
};

const deny = (rel, why) => {
	process.stderr.write(
		`⛔ Plan gate: editing \`${rel}\` is blocked — ${why}.\n` +
			`This repo enforces spec → plan → code (ADR-021).\n` +
			`  • Standard/complex: run /implement after an approved build/plan.md (it opens the gate).\n` +
			`  • Trivial fix: run /spec (it tags the marker 'trivial'), or set PLAN_GATE_OFF=1 to override.\n`,
	);
	process.exit(BLOCK);
};

const main = () => {
	if (process.env.PLAN_GATE_OFF === "1") process.exit(ALLOW);

	let payload;
	try {
		payload = JSON.parse(readStdin() || "{}");
	} catch {
		process.exit(ALLOW); // fail open
	}

	const tool = payload.tool_name || "";
	if (!/^(Write|Edit|MultiEdit)$/.test(tool)) process.exit(ALLOW);

	const filePath = payload.tool_input?.file_path || payload.tool_input?.path;
	if (!filePath) process.exit(ALLOW);

	const projectDir = process.env.CLAUDE_PROJECT_DIR || process.cwd();
	const rel = relative(projectDir, resolve(projectDir, filePath));

	// Outside the repo (e.g. the memory dir) → not our concern.
	if (rel.startsWith("..")) process.exit(ALLOW);
	// Always-writable zones.
	if (ALLOW_PREFIXES.some((p) => rel.startsWith(p))) process.exit(ALLOW);
	// Root-level config/docs (package.json, README.md, biome.jsonc, .gitignore, …).
	if (/^[^/]+\.(md|json|jsonc|ya?ml)$/.test(rel) || /^\.[^/]+$/.test(rel))
		process.exit(ALLOW);
	// Only gate known source zones; unknown paths pass.
	if (!GATED_PREFIXES.some((p) => rel.startsWith(p))) process.exit(ALLOW);

	// Marker required.
	const markerPath = resolve(projectDir, ".claude/.active-plan");
	if (!existsSync(markerPath)) deny(rel, "no active plan for this branch");

	let marker = "";
	try {
		marker = readFileSync(markerPath, "utf8").trim();
	} catch {
		process.exit(ALLOW); // unreadable marker → fail open
	}

	// Branch scoping: a marker for branch X doesn't unlock branch Y.
	let branch = "";
	try {
		branch = execSync("git rev-parse --abbrev-ref HEAD", {
			cwd: projectDir,
			stdio: ["ignore", "pipe", "ignore"],
		})
			.toString()
			.trim();
	} catch {
		branch = "";
	}
	if (
		branch &&
		marker.includes("branch=") &&
		!marker.split(/\r?\n/).includes(`branch=${branch}`)
	) {
		deny(rel, `the active plan is for a different branch (current: ${branch})`);
	}

	process.exit(ALLOW);
};

main();
