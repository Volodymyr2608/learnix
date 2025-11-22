/**
 * Run `build` or `dev` with `SKIP_ENV_VALIDATION` to skip env validation. This is especially useful
 * for Docker builds.
 */
import "./lib/env.js";

/** @type {import("next").NextConfig} */
const config = {
	images: {
		remotePatterns: [
			{
				protocol: "http",
				hostname: "localhost",
			},
		],
		domains: ["localhost"],
	},
};

export default config;
