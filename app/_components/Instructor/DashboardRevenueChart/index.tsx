// app/_components/Instructor/DashboardRevenueChart/index.tsx
"use client";

import { format, parseISO } from "date-fns";
import { Area, AreaChart, CartesianGrid, XAxis, YAxis } from "recharts";
import {
	ChartContainer,
	ChartTooltip,
	ChartTooltipContent,
} from "@/app/_components/_shared/ui/chart";
import { formatUsd } from "@/lib/formatUsd";
import type { DashboardRevenueChartProps } from "./types";

const config = { grossCents: { label: "Revenue", color: "var(--chart-1)" } };

export default function DashboardRevenueChart({
	data,
}: DashboardRevenueChartProps) {
	const hasData = data.some((p) => p.grossCents > 0);

	if (!hasData) {
		return (
			<div className="flex h-64 items-center justify-center rounded-lg border-2 border-dashed">
				<p className="text-muted-foreground text-sm">No revenue yet</p>
			</div>
		);
	}

	return (
		<ChartContainer className="h-64 w-full" config={config}>
			<AreaChart data={data} margin={{ left: 4, right: 4 }}>
				<defs>
					<linearGradient id="fillDashRevenue" x1="0" x2="0" y1="0" y2="1">
						<stop
							offset="5%"
							stopColor="var(--color-grossCents)"
							stopOpacity={0.8}
						/>
						<stop
							offset="95%"
							stopColor="var(--color-grossCents)"
							stopOpacity={0.1}
						/>
					</linearGradient>
				</defs>
				<CartesianGrid vertical={false} />
				<XAxis
					axisLine={false}
					dataKey="period"
					tickFormatter={(v: string) => format(parseISO(v), "MMM")}
					tickLine={false}
					tickMargin={8}
				/>
				<YAxis
					axisLine={false}
					tickFormatter={(v: number) => formatUsd(v)}
					tickLine={false}
					tickMargin={8}
				/>
				<ChartTooltip
					content={
						<ChartTooltipContent
							formatter={(value) => formatUsd(value)}
							labelFormatter={(l) => format(parseISO(l), "MMM yyyy")}
						/>
					}
					cursor={false}
				/>
				<Area
					dataKey="grossCents"
					fill="url(#fillDashRevenue)"
					stroke="var(--color-grossCents)"
					strokeWidth={2}
					type="monotone"
				/>
			</AreaChart>
		</ChartContainer>
	);
}
