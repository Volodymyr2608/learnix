import { env } from "@/lib/env";

/**
 * The app's own origin, resolvable on the server AND in the browser.
 *
 * `env.BASE_URL` is server-only. Reading `window.location.origin` is
 * client-only, and the lesson page is server-rendered — a client component
 * prerendered on the server has no `window`, so a policy that reaches for it
 * throws during SSR and 500s the page it is meant to protect. The trigger is an
 * ordinary instructor link, not an attack.
 *
 * One source for one decision: the server-side output boundary and the
 * client-side render policy must not disagree about what "our origin" is.
 */
export const appOrigin = (): string => {
	if (typeof window !== "undefined") return window.location.origin;
	return new URL(env.NEXT_PUBLIC_APP_URL).origin;
};

/**
 * `[x](<https://host/p>)` is one destination, not a destination wrapped in an
 * autolink. Without stripping, the leading "<" defeats the scheme test and an
 * off-origin host reads as relative.
 */
export const stripAngleBrackets = (href: string): string =>
	href.startsWith("<") && href.endsWith(">") ? href.slice(1, -1) : href;
