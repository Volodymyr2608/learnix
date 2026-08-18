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

	return (
		<a href={href} rel="noopener noreferrer" target="_blank" {...rest}>
			{children}
		</a>
	);
};
