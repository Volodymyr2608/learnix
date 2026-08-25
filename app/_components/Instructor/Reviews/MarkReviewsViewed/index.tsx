"use client";

import { usePathname, useRouter } from "next/navigation";
import { useEffect, useRef } from "react";
import { reportClientError } from "@/app/_components/ErrorBoundary/actions";
import { api } from "@/trpc/client";

export function MarkReviewsViewed() {
	const router = useRouter();
	const route = usePathname();
	const hasRun = useRef(false);
	const markViewed = api.instructor.markReviewsViewed.useMutation({
		onSuccess: () => router.refresh(),
		onError: (error) => {
			void reportClientError({
				errorClass: error.data?.code ?? "TRPCClientError",
				route,
			});
		},
	});

	useEffect(() => {
		if (hasRun.current) return;
		hasRun.current = true;
		markViewed.mutate();
	}, [markViewed]);

	return null;
}
