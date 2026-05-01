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
				protocol: "https",
				hostname: "jhutb95vm6eik0be.public.blob.vercel-storage.com",
				port: "",
			},
			{
				protocol: "https",
				hostname: "lh3.googleusercontent.com",
				port: "",
			},
		],
	},
	headers: async () => [
		{
			source: "/push/esputnik/push-esputnik-sw.js",
			headers: [{ key: "Service-Worker-Allowed", value: "/" }],
		},
	],
};

export default config;
