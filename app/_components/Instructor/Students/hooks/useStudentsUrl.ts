"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useCallback, useTransition } from "react";
import type { StudentsQueryState } from "../types";

type StudentsUrlUpdate = Partial<
	Pick<StudentsQueryState, "q" | "status" | "courseId" | "sort" | "page">
>;

// Changing any of these resets pagination back to the first page.
const FILTER_KEYS = ["q", "status", "courseId", "sort"] as const;

// Values that represent the default and are therefore omitted from the URL.
const DEFAULTS: Record<string, string> = {
	status: "all",
	courseId: "all",
	sort: "recent",
	page: "1",
	q: "",
};

function isDefault(key: string, value: string): boolean {
	return DEFAULTS[key] === value;
}

/**
 * Writes the students query into the URL search params (the source of truth).
 * Filter changes reset `page`; default values are dropped to keep URLs clean.
 * Navigation runs in a transition so callers can show a pending state.
 */
export function useStudentsUrl() {
	const router = useRouter();
	const pathname = usePathname();
	const searchParams = useSearchParams();
	const [isPending, startTransition] = useTransition();

	const update = useCallback(
		(updates: StudentsUrlUpdate) => {
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
