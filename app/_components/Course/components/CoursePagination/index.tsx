"use client";

import { useRouter } from "next/navigation";
import ReactPaginate from "react-paginate";
import { cn } from "@/lib/utils/cn";
import type {CoursePaginationProps} from "@/app/_components/Course/components/CoursePagination/types";

export const CoursePagination = ({
	currentPage,
	totalPages,
	basePath,
	query = {},
}: CoursePaginationProps) => {
	const router = useRouter();

	const itemClass = cn(
		"inline-flex h-8 w-8 items-center justify-center rounded-md text-sm transition-colors hover:bg-muted",
	);

	const buildHref = (page: number) => {
		const params = new URLSearchParams(query);
		if (page > 1) params.set("page", String(page));
		const qs = params.toString();
		return qs ? `${basePath}?${qs}` : basePath;
	};

	return (
		<ReactPaginate
			activeClassName="!bg-primary !text-primary-foreground"
			breakClassName={itemClass}
			breakLabel="…"
			className="flex items-center justify-center gap-1"
			disabledClassName="opacity-50 pointer-events-none"
			forcePage={currentPage - 1}
			marginPagesDisplayed={1}
			nextClassName={itemClass}
			nextLabel="›"
			onPageChange={({ selected }) => router.push(buildHref(selected + 1))}
			pageClassName={itemClass}
			pageCount={totalPages}
			pageRangeDisplayed={3}
			previousClassName={itemClass}
			previousLabel="‹"
			renderOnZeroPageCount={null}
		/>
	);
};
