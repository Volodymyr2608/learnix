"use client";

import { ErrorFallback } from "@/app/_components/ErrorBoundary/ErrorFallback";
import type { ErrorFallbackProps } from "@/app/_components/ErrorBoundary/ErrorFallback/types";

import "styles/globals.css";

/**
 * Next.js's root error boundary (spec.md "6. Error boundaries", AC 7). Fires when the
 * root layout itself throws, so per Next's convention it replaces that layout entirely
 * — it must render its own <html>/<body> and, since no ancestor layout is left mounted
 * to supply one, its own stylesheet.
 */
const GlobalError = ({ error, reset }: ErrorFallbackProps) => (
	<html lang="en">
		<body>
			<ErrorFallback error={error} reset={reset} />
		</body>
	</html>
);

export default GlobalError;
