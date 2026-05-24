import { defineConfig, defineProject } from "vitest/config";

export default defineConfig({
	resolve: { tsconfigPaths: true },
	test: {
		coverage: {
			provider: "v8",
			include: ["server/services/**", "lib/utils/**", "lib/guards/**"],
			reporter: ["text", "html"],
		},
		projects: [
			defineProject({
				test: {
					name: "unit",
					environment: "node",
					include: ["**/*.test.ts"],
					exclude: ["**/*.integration.test.ts", "**/node_modules/**"],
					setupFiles: ["./test/loadEnv.ts"],
				},
			}),
			defineProject({
				test: {
					name: "integration",
					environment: "node",
					include: ["**/*.integration.test.ts"],
					exclude: ["**/node_modules/**"],
					setupFiles: ["./test/loadEnv.ts", "./test/setup.integration.ts"],
					fileParallelism: false,
				},
			}),
		],
	},
});