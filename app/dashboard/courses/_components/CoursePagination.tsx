import Link from "next/link";
import { cn } from "@/lib/utils/cn";

type Props = {
	currentPage: number;
	totalPages: number;
	tab: string;
};

function pageHref(page: number, tab: string) {
	return `/dashboard/courses?tab=${tab}&page=${page}`;
}

type PageItem = number | "ellipsis-start" | "ellipsis-end";

function buildPages(current: number, total: number): PageItem[] {
	if (total <= 7) return Array.from({ length: total }, (_, i) => i + 1);

	const pages: PageItem[] = [1];

	if (current > 3) pages.push("ellipsis-start");

	const start = Math.max(2, current - 1);
	const end = Math.min(total - 1, current + 1);
	for (let i = start; i <= end; i++) pages.push(i);

	if (current < total - 2) pages.push("ellipsis-end");

	pages.push(total);
	return pages;
}

export default function CoursePagination({
	currentPage,
	totalPages,
	tab,
}: Props) {
	const pages = buildPages(currentPage, totalPages);

	return (
		<div className="flex items-center justify-center gap-1">
			<Link
				aria-disabled={currentPage === 1}
				aria-label="Previous page"
				className={cn(
					"inline-flex h-8 w-8 items-center justify-center rounded-md text-sm transition-colors",
					currentPage === 1
						? "pointer-events-none text-muted-foreground opacity-50"
						: "hover:bg-muted",
				)}
				href={pageHref(currentPage - 1, tab)}
			>
				&lsaquo;
			</Link>

			{pages.map((p) =>
				typeof p === "string" ? (
					<span
						className="inline-flex h-8 w-8 items-center justify-center text-muted-foreground text-sm"
						key={p}
					>
						&hellip;
					</span>
				) : (
					<Link
						aria-current={p === currentPage ? "page" : undefined}
						className={cn(
							"inline-flex h-8 w-8 items-center justify-center rounded-md text-sm transition-colors",
							p === currentPage
								? "bg-primary text-primary-foreground"
								: "hover:bg-muted",
						)}
						href={pageHref(p, tab)}
						key={p}
					>
						{p}
					</Link>
				),
			)}

			<Link
				aria-disabled={currentPage === totalPages}
				aria-label="Next page"
				className={cn(
					"inline-flex h-8 w-8 items-center justify-center rounded-md text-sm transition-colors",
					currentPage === totalPages
						? "pointer-events-none text-muted-foreground opacity-50"
						: "hover:bg-muted",
				)}
				href={pageHref(currentPage + 1, tab)}
			>
				&rsaquo;
			</Link>
		</div>
	);
}
