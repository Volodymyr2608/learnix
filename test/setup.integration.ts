import { afterAll, beforeEach } from "vitest";
import { testDb, truncateAll } from "./db";

const url = process.env.DATABASE_URL ?? "";
if (!url.includes("learnix_test")) {
	throw new Error(
		`Refusing to run integration tests: DATABASE_URL is not a learnix_test database (got "${url}"). Set up .env.test.`,
	);
}

beforeEach(async () => {
	await truncateAll();
});

afterAll(async () => {
	await testDb.$disconnect();
});
