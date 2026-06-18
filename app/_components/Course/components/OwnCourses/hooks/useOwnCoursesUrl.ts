"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { useCallback, useTransition } from "react";
import { buildOwnCoursesHref } from "../helpers/buildOwnCoursesHref";
import { parseOwnCoursesSearchParams } from "../searchParams";
import type { OwnCoursesQueryState } from "../types";

type Update = Partial<
	Pick<OwnCoursesQueryState, "q" | "status" | "category" | "sort" | "page">
>;

// Changing any of these resets pagination back to the first page.
const FILTER_KEYS = ["q", "status", "category", "sort"] as const;

/**
 * Writes the own-courses query into the URL (the source of truth). Reads the
 * current state from the URL, merges the partial update, resets `page` on any
 * filter/search change, and pushes the canonical href in a transition.
 */
export function useOwnCoursesUrl() {
	const router = useRouter();
	const searchParams = useSearchParams();
	const [isPending, startTransition] = useTransition();

	const update = useCallback(
		(updates: Update) => {
			const current = parseOwnCoursesSearchParams(
				Object.fromEntries(searchParams.entries()),
			);
			const changedFilter = FILTER_KEYS.some((key) => key in updates);
			const next: OwnCoursesQueryState = {
				...current,
				...updates,
				page:
					changedFilter && updates.page === undefined
						? 1
						: (updates.page ?? current.page),
			};
			const href = buildOwnCoursesHref(next);
			startTransition(() => router.push(href, { scroll: false }));
		},
		[router, searchParams],
	);

	return { update, isPending };
}
