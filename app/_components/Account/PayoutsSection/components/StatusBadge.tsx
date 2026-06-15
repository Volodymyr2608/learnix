"use client";

import { Badge } from "@/app/_components/_shared/ui/badge";
import { STATUS_CONFIG } from "@/app/_components/Account/PayoutsSection/helpers";
import type { StatusBadgeProps } from "@/app/_components/Account/PayoutsSection/types";

export function StatusBadge({ status }: StatusBadgeProps) {
	const config = STATUS_CONFIG[status];
	return <Badge className={config.className}>{config.label}</Badge>;
}
