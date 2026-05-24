import { config } from "dotenv";

// Loads .env.test for local runs. In CI the vars come from the job env,
// and dotenv silently does nothing when the file is absent.
config({ path: ".env.test" });
// Skip lib/env.js validation in all tests — stub values won't pass production rules.
process.env.SKIP_ENV_VALIDATION ??= "true";
