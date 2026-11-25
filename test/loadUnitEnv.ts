import "./loadEnv";

// Unit tests have no database (CLAUDE.md, testing pyramid). `.env.test` points
// DATABASE_URL at the local learnix_test, so a unit test that reached Prisma
// through an unmocked repository passed locally and failed only in CI, where
// the unit job has no DATABASE_URL at all — userService.anonymiseAccount did
// exactly that after the refund work added a repository read to it. An
// unreachable address makes such a test fail here too, at the first query.
process.env.DATABASE_URL =
	"postgresql://unit-tests-have-no-database@127.0.0.1:1/none";
