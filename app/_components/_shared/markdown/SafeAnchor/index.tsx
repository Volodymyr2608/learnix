import { isOffOrigin } from "@/lib/url";
import type { SafeAnchorProps } from "./types";

/**
 * An anchor that opts an off-origin destination out of `window.opener` access
 * and referrer leakage. It asks `lib/url` the same question the URL policy asks,
 * so the keep/drop decision and the `rel` decision cannot drift apart — a second
 * regex here would be a second answer.
 */
export const SafeAnchor = ({ href, children, ...rest }: SafeAnchorProps) => {
	if (!href) return <a {...rest}>{children}</a>;

	if (!isOffOrigin(href)) {
		return (
			<a href={href} {...rest}>
				{children}
			</a>
		);
	}

	// `rest` is spread FIRST so a `rel` or `target` arriving with the node cannot
	// override the hardening. Nothing can supply those today — rehype-raw is off
	// everywhere, and a renderer contract test keeps it off — but the ordering
	// should not be the thing standing between that and an opener leak.
	return (
		<a {...rest} href={href} rel="noopener noreferrer" target="_blank">
			{children}
		</a>
	);
};
