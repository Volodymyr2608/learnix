import { Tag } from "lucide-react";
import { Button } from "@/app/_components/_shared/ui/button";
import { Card } from "@/app/_components/_shared/ui/card";
import {
	countResources,
	sumVideoDurationMinutes,
} from "@/lib/course/courseStats";
import { computeDiscountPercent } from "@/lib/course/discount";
import { formatDuration } from "@/lib/format/formatDuration";
import { formatPrice } from "@/lib/formatPrice";
import type { DiscountBadgeProps, PricingSidebarProps } from "./types";

function DiscountBadge({ percent }: DiscountBadgeProps) {
	return (
		<p className="flex items-center gap-1 text-green-600 text-sm">
			<Tag aria-hidden className="h-3.5 w-3.5" />
			<span>{percent}% off</span>
		</p>
	);
}

export function PricingSidebar({
	priceCents,
	originalPriceCents,
	sections,
}: PricingSidebarProps) {
	const discountPercent = computeDiscountPercent(
		priceCents,
		originalPriceCents,
	);
	const videoMinutes = sumVideoDurationMinutes(sections);
	const resourceCount = countResources(sections);

	return (
		<Card className="sticky top-6 p-6">
			<div className="space-y-4">
				<div>
					<div className="flex items-baseline gap-2">
						<span className="font-bold text-3xl">
							{formatPrice(priceCents)}
						</span>
						{originalPriceCents && (
							<span className="text-lg text-muted-foreground line-through">
								{formatPrice(originalPriceCents)}
							</span>
						)}
					</div>
					{discountPercent != null && (
						<DiscountBadge percent={discountPercent} />
					)}
				</div>

				<Button className="w-full" disabled size="lg">
					Preview Mode - Not Purchasable
				</Button>

				<div className="space-y-2 text-sm">
					<h3 className="font-semibold">This course includes:</h3>
					<div className="space-y-1 text-muted-foreground">
						<p>• {formatDuration(videoMinutes)} on-demand video</p>
						<p>• {resourceCount} downloadable resources</p>
						<p>• Full lifetime access</p>
						<p>• Certificate of completion</p>
					</div>
				</div>
			</div>
		</Card>
	);
}
