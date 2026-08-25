import { defineConfig, defineProject } from "vitest/config";

export default defineConfig({
	test: {
		coverage: {
			provider: "v8",
			include: [
				"server/services/**",
				"lib/utils/**",
				"lib/guards/**",
				"lib/parse/**",
			],
			reporter: ["text", "html"],
		},
		projects: [
			defineProject({
				resolve: { tsconfigPaths: true },
				test: {
					name: "unit",
					environment: "node",
					include: ["**/*.test.ts"],
					exclude: [
						"**/*.integration.test.ts",
						// Its own tier: it needs a live Redis, and `**/*.test.ts` would
						// otherwise match it here too and run every case twice.
						"**/*.redis.test.ts",
						"**/node_modules/**",
					],
					setupFiles: ["./test/loadEnv.ts"],
				},
			}),
			defineProject({
				resolve: { tsconfigPaths: true },
				test: {
					name: "integration",
					environment: "node",
					include: ["**/*.integration.test.ts"],
					exclude: ["**/node_modules/**"],
					setupFiles: ["./test/loadEnv.ts", "./test/setup.integration.ts"],
					fileParallelism: false,
				},
			}),
			defineProject({
				resolve: { tsconfigPaths: true },
				test: {
					name: "redis",
					environment: "node",
					include: ["**/*.redis.test.ts"],
					exclude: ["**/node_modules/**"],
					setupFiles: ["./test/loadEnv.ts"],
					// One shared Redis, and the distribution test asserts an exact shared
					// ceiling — parallel files would race on the same keys.
					fileParallelism: false,
				},
			}),
		],
	},
});
