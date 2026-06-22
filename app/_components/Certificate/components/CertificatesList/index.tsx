import { Award, BadgeCheck, CalendarDays, Download, User } from "lucide-react";
import { Badge } from "@/app/_components/_shared/ui/badge";
import { Button } from "@/app/_components/_shared/ui/button";
import {
	Card,
	CardContent,
	CardFooter,
} from "@/app/_components/_shared/ui/card";
import type {
	CertificateCardProps,
	CertificatesListProps,
} from "@/app/_components/Certificate/components/CertificatesList/types";

function CertificateCard({ item }: CertificateCardProps) {
	const completedLabel = item.completedAt.toLocaleDateString(undefined, {
		year: "numeric",
		month: "long",
		day: "numeric",
	});

	return (
		<Card className="group relative gap-0 overflow-hidden py-0 transition-all hover:shadow-md">
			<Award className="pointer-events-none absolute -top-8 -right-8 h-32 w-32 text-amber-500/[0.06] transition-transform duration-300 group-hover:scale-110" />
			<CardContent className="px-6 pt-6">
				<div className="flex items-start justify-between gap-3">
					<div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-amber-400 to-amber-600 text-white shadow-sm ring-4 ring-amber-500/10">
						<Award className="h-6 w-6" />
					</div>
					<Badge
						className="gap-1 border-amber-500/20 bg-amber-500/10 text-amber-700 dark:text-amber-400"
						variant="outline"
					>
						<BadgeCheck className="h-3 w-3" />
						Completed
					</Badge>
				</div>
				<h3 className="mt-4 line-clamp-2 font-semibold text-base leading-snug">
					{item.courseTitle}
				</h3>
				<div className="mt-2 space-y-1 text-muted-foreground text-sm">
					<p className="flex items-center gap-1.5">
						<User className="h-3.5 w-3.5 shrink-0" />
						<span className="truncate">{item.instructorName}</span>
					</p>
					<p className="flex items-center gap-1.5">
						<CalendarDays className="h-3.5 w-3.5 shrink-0" />
						{completedLabel}
					</p>
				</div>
			</CardContent>
			<CardFooter className="px-6 pt-4 pb-6">
				<Button asChild className="w-full">
					<a download href={item.downloadUrl}>
						<Download className="h-4 w-4" />
						Download certificate
					</a>
				</Button>
			</CardFooter>
		</Card>
	);
}

const CertificatesList = ({ items }: CertificatesListProps) => {
	return (
		<div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
			{items.map((item) => (
				<CertificateCard item={item} key={item.enrollmentId} />
			))}
		</div>
	);
};

export default CertificatesList;
