// Post-build check for spec.md AC 29 and AC 35 (docs/specs/features/error-observability/spec.md).
// Not a vitest test: vitest never produces a real `.next/` output, so this has to run
// as a standalone step after `pnpm build`, e.g.:
//   pnpm build && tsx scripts/check-build-artifacts.ts
//
// AC 35: `sourcemaps.deleteSourcemapsAfterUpload: true` in next.config.ts is supposed to
// delete source maps once they're uploaded to Sentry. If that setting ever regresses, the
// maps stay in `.next/static` and Next.js serves them publicly, letting anyone reconstruct
// original source from the shipped bundle. This asserts none survived the build.
//
// AC 29: `SENTRY_AUTH_TOKEN` is a build-only credential read in next.config.ts and must
// never reach output that gets served to the client. This checks the identifier itself
// does not appear anywhere under `.next/`, and — when a real token value is available in
// this environment — additionally checks the secret VALUE was never embedded either. The
// value check is the stronger proof, but it's only possible when we have a real value to
// grep for; the identifier-name check runs unconditionally so the script is still
// meaningful in an environment with no token configured (e.g. a local checkout).
import fs from "node:fs";
import path from "node:path";

const NEXT_DIR = path.join(process.cwd(), ".next");

if (!fs.existsSync(NEXT_DIR)) {
	console.error(`${NEXT_DIR} not found — run \`pnpm build\` first.`);
	process.exit(1);
}

// `.next/dev` is Turbopack's `next dev` cache — a separate directory tree that
// `next build` never writes to and that never ships in a deploy. A machine that has
// run `pnpm dev` at some point (any local checkout) keeps it sitting next to the real
// build output, and it can be hundreds of MB, so it is excluded from the walk rather
// than silently making every local run of this script report stale dev-cache noise.
const EXCLUDED_DIRS = new Set(["dev"]);

const walk = (dir: string): string[] =>
	fs.readdirSync(dir).flatMap((entry) => {
		const full = path.join(dir, entry);
		if (fs.statSync(full).isDirectory()) {
			return EXCLUDED_DIRS.has(entry) ? [] : walk(full);
		}
		return [full];
	});

// Fonts, images and other binary assets can't contain either literal string in any
// meaningful sense and are expensive to read; skip them.
const BINARY_EXTENSIONS = new Set([
	".woff",
	".woff2",
	".ttf",
	".otf",
	".png",
	".jpg",
	".jpeg",
	".gif",
	".webp",
	".avif",
	".ico",
	".svg",
]);

const readTextSafe = (file: string): string => {
	if (BINARY_EXTENSIONS.has(path.extname(file).toLowerCase())) return "";
	try {
		return fs.readFileSync(file, "utf-8");
	} catch {
		return "";
	}
};

const failures: string[] = [];

const staticDir = path.join(NEXT_DIR, "static");
if (fs.existsSync(staticDir)) {
	const mapFiles = walk(staticDir).filter((f) => f.endsWith(".map"));
	if (mapFiles.length > 0) {
		failures.push(
			`AC 35: found ${mapFiles.length} .map file(s) under .next/static — deleteSourcemapsAfterUpload did not run or was bypassed:\n${mapFiles.join("\n")}`,
		);
	}
} else {
	failures.push(
		`AC 35: ${staticDir} not found — expected a static output directory after \`pnpm build\`.`,
	);
}

const allFiles = walk(NEXT_DIR);

const nameOffenders = allFiles.filter((f) =>
	readTextSafe(f).includes("SENTRY_AUTH_TOKEN"),
);
if (nameOffenders.length > 0) {
	failures.push(
		`AC 29: found the string "SENTRY_AUTH_TOKEN" in build output:\n${nameOffenders.join("\n")}`,
	);
}

const tokenValue = process.env.SENTRY_AUTH_TOKEN;
if (tokenValue) {
	const valueOffenders = allFiles.filter((f) =>
		readTextSafe(f).includes(tokenValue),
	);
	if (valueOffenders.length > 0) {
		failures.push(
			`AC 29: found the SENTRY_AUTH_TOKEN secret value embedded in build output:\n${valueOffenders.join("\n")}`,
		);
	}
} else {
	console.log(
		"SENTRY_AUTH_TOKEN is not set in this environment — skipping the secret-value check; the identifier-name check above still ran.",
	);
}

if (failures.length > 0) {
	console.error(failures.join("\n\n"));
	process.exit(1);
}

console.log(
	"check-build-artifacts: OK — no .map files under .next/static, no SENTRY_AUTH_TOKEN leakage under .next/.",
);
