import { readFileSync } from "node:fs";
import { describe, expect, it, vi } from "vitest";
import { CHECK_AND_BUMP_SCRIPT, createUpstashStore } from "./upstash.store";

/**
 * The client is injected, so this asserts the wiring without a network. Live
 * behaviour is covered in upstash.redis.test.ts against serverless-redis-http.
 *
 * Note the client cannot be stubbed after construction: @upstash/redis
 * auto-pipelines and routes `eval` through a proxy, so an assignment over it is
 * silently ignored and the call reaches the network.
 */
const withFakeEval = (
	evalImpl: (
		script: string,
		keys: string[],
		args: string[],
	) => Promise<unknown>,
) =>
	createUpstashStore("http://localhost:1", "t", {
		eval: evalImpl,
		get: async () => null,
		keys: async () => [],
		del: async () => 0,
	});

describe("upstash store", () => {
	it("passes one key per window and windowMs followed by each max", async () => {
		const evalSpy = vi.fn().mockResolvedValue(1);
		const store = withFakeEval(evalSpy);

		await store.checkAndBump(
			[
				{ key: "u1 aggregate", max: 30 },
				{ key: "u1:quizAI", max: 10 },
			],
			60_000,
		);

		const [script, keys, args] = evalSpy.mock.calls[0] as [
			string,
			string[],
			string[],
		];
		expect(script).toBe(CHECK_AND_BUMP_SCRIPT);
		expect(keys).toHaveLength(2);
		expect(keys[0]).toContain("u1 aggregate");
		expect(keys[1]).toContain("u1:quizAI");
		expect(args).toEqual(["60000", "30", "10"]);
	});

	it("namespaces keys so a preview deployment cannot share buckets", async () => {
		const evalSpy = vi.fn().mockResolvedValue(1);
		const store = withFakeEval(evalSpy);

		await store.checkAndBump([{ key: "u1:quizAI", max: 10 }], 60_000);

		const keys = (evalSpy.mock.calls[0] as [string, string[], string[]])[1];
		expect(keys[0]).toMatch(/^airl:v1:[a-z]+:u1:quizAI$/);
	});

	it("fails CLOSED when the store errors", async () => {
		const store = withFakeEval(() => Promise.reject(new Error("ECONNREFUSED")));

		expect(await store.checkAndBump([{ key: "k", max: 10 }], 60_000)).toBe(
			false,
		);
	});

	it("fails CLOSED when the store times out", async () => {
		const timeout = Object.assign(new Error("timed out"), {
			name: "TimeoutError",
		});
		const store = withFakeEval(() => Promise.reject(timeout));

		expect(await store.checkAndBump([{ key: "k", max: 10 }], 60_000)).toBe(
			false,
		);
	});

	it("treats any non-1 reply as a rejection", async () => {
		const store = withFakeEval(() => Promise.resolve(0));

		expect(await store.checkAndBump([{ key: "k", max: 10 }], 60_000)).toBe(
			false,
		);
	});

	it("never reaches for the read-only token or Redis.fromEnv (AC 16a, 16b)", () => {
		// The limiter only ever writes. A read-only token would fail every INCR, and
		// because the adapter fails closed that surfaces as "every AI request
		// rate-limited" rather than as a credentials error — so the guard is that
		// the name never enters the codebase. fromEnv() reads UPSTASH_REDIS_REST_*,
		// which this deployment does not set.
		const sources = [
			"server/services/_shared/aiLimits/store/upstash.store.ts",
			"server/services/_shared/aiLimits/store/index.ts",
			"lib/env.js",
		]
			.map((file) => readFileSync(file, "utf-8"))
			.join("\n")
			.replace(/\/\*[\s\S]*?\*\//g, "")
			.replace(/\/\/.*$/gm, "");

		expect(sources).not.toMatch(/KV_REST_API_READ_ONLY_TOKEN/);
		expect(sources).not.toMatch(/fromEnv\(/);
	});

	it("the script checks every key before incrementing any", () => {
		// A structural assertion on the Lua: the guard loop must close before the
		// first INCR. Two separate loops is the whole reason this is one script.
		const guardLoopEnd = CHECK_AND_BUMP_SCRIPT.indexOf("return 0");
		const firstIncr = CHECK_AND_BUMP_SCRIPT.indexOf("INCR");

		expect(guardLoopEnd).toBeGreaterThan(-1);
		expect(firstIncr).toBeGreaterThan(guardLoopEnd);
	});

	it("sets the TTL only on the transition to 1, keeping the window fixed", () => {
		// PEXPIRE on every increment would make the window rolling: steady traffic
		// would hold it open forever and it would never reset.
		expect(CHECK_AND_BUMP_SCRIPT).toMatch(/==\s*1\s*then[\s\S]*?PEXPIRE/);
	});
});
