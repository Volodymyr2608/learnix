"use client";

import { useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";

export const useBrowseSearch = (q: string, category: string) => {
	const router = useRouter();
	const [search, setSearch] = useState(q);
	const timerRef = useRef<ReturnType<typeof setTimeout>>(null);

	useEffect(() => {
		setSearch(q);
	}, [q]);

	const handleSearch = useCallback(
		(value: string) => {
			setSearch(value);
			if (timerRef.current) clearTimeout(timerRef.current);
			timerRef.current = setTimeout(() => {
				const params = new URLSearchParams();
				if (value) params.set("q", value);
				if (category && category !== "all") params.set("category", category);
				const qs = params.toString();
				router.push(`/dashboard/browse${qs ? `?${qs}` : ""}`);
			}, 300);
		},
		[category, router],
	);

	return { search, handleSearch };
};
