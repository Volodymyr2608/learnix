"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useCallback, useTransition } from "react";
import type { ReviewsQueryState } from "../types";

type ReviewsUrlUpdate = Partial<
	Pick<ReviewsQueryState, "courseId" | "rating" | "page">
>;

// Changing a filter resets pagination back to the first page.
const FILTER_KEYS = ["courseId", "rating"] as const;

// Values that represent the default and are therefore omitted from the URL.
const DEFAULTS: Record<string, string> = {
	courseId: "all",
	rating: "all",
	page: "1",
};

function isDefault(key: string, value: string): boolean {
	return DEFAULTS[key] === value;
}

/**
 * Writes the reviews query into the URL search params (the source of truth).
 * Filter changes reset `page`; default values are dropped to keep URLs clean.
 * Navigation runs in a transition so callers can show a pending state.
 */
export function useReviewsUrl() {
	const router = useRouter();
	const pathname = usePathname();
	const searchParams = useSearchParams();
	const [isPending, startTransition] = useTransition();

	const update = useCallback(
		(updates: ReviewsUrlUpdate) => {
			const params = new URLSearchParams(searchParams.toString());

			const changedFilter = FILTER_KEYS.some((key) => key in updates);
			if (changedFilter && updates.page === undefined) {
				params.delete("page");
			}

			for (const [key, value] of Object.entries(updates)) {
				const str = String(value);
				if (value === undefined || isDefault(key, str)) {
					params.delete(key);
				} else {
					params.set(key, str);
				}
			}

			const qs = params.toString();
			startTransition(() => {
				router.push(qs ? `${pathname}?${qs}` : pathname, { scroll: false });
			});
		},
		[router, pathname, searchParams],
	);

	return { update, isPending };
}
