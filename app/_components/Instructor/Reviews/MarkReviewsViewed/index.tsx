"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef } from "react";
import { api } from "@/trpc/client";

export function MarkReviewsViewed() {
	const router = useRouter();
	const hasRun = useRef(false);
	const markViewed = api.instructor.markReviewsViewed.useMutation({
		onSuccess: () => router.refresh(),
		onError: (error) => {
			console.error("Failed to mark reviews viewed:", error);
		},
	});

	useEffect(() => {
		if (hasRun.current) return;
		hasRun.current = true;
		markViewed.mutate();
	}, [markViewed]);

	return null;
}
