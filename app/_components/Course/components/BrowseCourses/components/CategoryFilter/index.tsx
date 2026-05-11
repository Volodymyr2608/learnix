import Link from "next/link";
import CATEGORIES from "@/app/_components/Course/constants/categories";
import { cn } from "@/lib/utils/cn";
import { buildCategoryHref, toSlug } from "../../helpers/categoryHelpers";

type Props = {
	category: string;
	search: string;
};

export const CategoryFilter = ({ category, search }: Props) => (
	<div className="flex gap-2 overflow-x-auto pb-2">
		{CATEGORIES.map((cat) => {
			const isActive =
				cat === "All" ? category === "all" : category === toSlug(cat);
			return (
				<Link
					className={cn(
						"inline-flex shrink-0 items-center justify-center rounded-md border px-3 py-1 font-medium text-sm transition-colors",
						isActive
							? "border-primary bg-primary text-primary-foreground"
							: "border-input bg-background hover:bg-muted",
					)}
					href={buildCategoryHref(cat, search)}
					key={cat}
				>
					{cat}
				</Link>
			);
		})}
	</div>
);
