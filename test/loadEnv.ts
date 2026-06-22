import { config } from "dotenv";

// Loads .env.test for local runs. In CI the vars come from the job env,
// and dotenv silently does nothing when the file is absent.
config({ path: ".env.test" });
// Skip lib/env.js validation in all tests — stub values won't pass production rules.
process.env.SKIP_ENV_VALIDATION ??= "true";

// JWT signing secrets are used as jose keys: an empty/absent value makes jose
// throw "Zero-length key is not supported" rather than a readable failure.
// Backfill a deterministic stub so unit tests never depend on a perfectly
// synced local .env.test (or a CI job env) supplying these. `||=` also
// replaces an empty string, which is the exact value that triggers the error.
// This runs before any test module imports lib/env.js, so the stub is the
// value captured into env. Production never reaches here (skipValidation is
// false there, so a real non-empty secret is required at boot).
process.env.CERTIFICATE_SECRET ||=
	"test-certificate-secret-at-least-32-chars-long";
process.env.INVOICE_SECRET ||= "test-invoice-secret-at-least-32-chars-long";
process.env.UNSUBSCRIBE_SECRET ||=
	"test-unsubscribe-secret-at-least-32-chars-long";
