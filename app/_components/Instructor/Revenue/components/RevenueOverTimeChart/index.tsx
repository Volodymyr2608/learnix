"use client";

import { format, parseISO } from "date-fns";
import { Area, AreaChart, CartesianGrid, XAxis, YAxis } from "recharts";
import { Card } from "@/app/_components/_shared/ui/card";
import {
	ChartContainer,
	ChartTooltip,
	ChartTooltipContent,
} from "@/app/_components/_shared/ui/chart";
import { formatUsd } from "@/lib/formatUsd";
import type { RevenueOverTimeChartProps } from "./types";

const config = {
	grossCents: { label: "Revenue", color: "var(--chart-1)" },
	netCents: { label: "Net Payout", color: "var(--chart-2)" },
};

export default function RevenueOverTimeChart({
	data,
	isLoading,
}: RevenueOverTimeChartProps) {
	const hasData = !!data && data.some((p) => p.grossCents > 0);
	return (
		<Card className="p-6 lg:col-span-2">
			<div className="mb-4">
				<h2 className="font-semibold text-lg">Revenue &amp; Payouts</h2>
				<p className="text-muted-foreground text-sm">
					Gross revenue vs. net payout over time
				</p>
			</div>
			{isLoading && (
				<div className="h-[300px] animate-pulse rounded-lg bg-muted" />
			)}
			{!isLoading && !hasData && (
				<div className="flex h-[300px] items-center justify-center rounded-lg border-2 border-dashed">
					<p className="text-muted-foreground text-sm">
						No sales in this range
					</p>
				</div>
			)}
			{!isLoading && hasData && (
				<ChartContainer className="h-[300px] w-full" config={config}>
					<AreaChart data={data} margin={{ left: 4, right: 4 }}>
						<defs>
							<linearGradient id="fillGross" x1="0" x2="0" y1="0" y2="1">
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
							<linearGradient id="fillNet" x1="0" x2="0" y1="0" y2="1">
								<stop
									offset="5%"
									stopColor="var(--color-netCents)"
									stopOpacity={0.8}
								/>
								<stop
									offset="95%"
									stopColor="var(--color-netCents)"
									stopOpacity={0.1}
								/>
							</linearGradient>
						</defs>
						<CartesianGrid vertical={false} />
						<XAxis
							axisLine={false}
							dataKey="period"
							interval="preserveStartEnd"
							minTickGap={24}
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
									labelFormatter={(l) => format(parseISO(l), "MMM d, yyyy")}
								/>
							}
							cursor={false}
						/>
						<Area
							dataKey="grossCents"
							fill="url(#fillGross)"
							stroke="var(--color-grossCents)"
							strokeWidth={2}
							type="monotone"
						/>
						<Area
							dataKey="netCents"
							fill="url(#fillNet)"
							stroke="var(--color-netCents)"
							strokeWidth={2}
							type="monotone"
						/>
					</AreaChart>
				</ChartContainer>
			)}
		</Card>
	);
}
