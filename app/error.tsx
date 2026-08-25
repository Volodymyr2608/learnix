"use client";

import { ErrorFallback } from "@/app/_components/ErrorBoundary/ErrorFallback";
import type { ErrorFallbackProps } from "@/app/_components/ErrorBoundary/ErrorFallback/types";

/**
 * Next.js's route-level error boundary (spec.md "6. Error boundaries", AC 7).
 * Catches an uncaught error in this segment's subtree; the root layout, and
 * everything outside the segment, stays mounted.
 */
const RouteError = ({ error, reset }: ErrorFallbackProps) => (
	<ErrorFallback error={error} reset={reset} />
);

export default RouteError;
