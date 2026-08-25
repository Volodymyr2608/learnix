"use client";

import { AlertTriangle } from "lucide-react";
import { useEffect, useRef } from "react";
import { Button } from "@/app/_components/_shared/ui/button";
import { reportClientError } from "../actions";
import type { ErrorFallbackProps } from "./types";

/**
 * Rendered by both app/error.tsx (route-level) and app/global-error.tsx (root-level).
 * Owns the report call itself — CLAUDE.md's "sub-components own their own mutations" —
 * rather than the two boundary files each calling it, so the report fires exactly once
 * per error regardless of which boundary caught it.
 */
export const ErrorFallback = ({ error, reset }: ErrorFallbackProps) => {
	const reportedErrorRef = useRef<Error | null>(null);

	useEffect(() => {
		if (reportedErrorRef.current === error) return;
		reportedErrorRef.current = error;

		// Effects never run during SSR, so `window` is always defined here.
		void reportClientError({
			digest: error.digest,
			errorClass: error.name,
			route: window.location.pathname,
		});
	}, [error]);

	return (
		<div className="flex min-h-[60vh] flex-col items-center justify-center gap-4 px-6 py-16 text-center">
			<AlertTriangle aria-hidden className="h-10 w-10 text-destructive" />
			<h2 className="font-semibold text-xl">Something went wrong</h2>
			<p className="max-w-md text-muted-foreground text-sm">
				An unexpected error occurred. You can try again, or come back later if
				the problem persists.
			</p>
			<Button onClick={reset} type="button">
				Try again
			</Button>
		</div>
	);
};
