"use client";

import { Bar, BarChart, CartesianGrid, XAxis, YAxis } from "recharts";
import useIsMobile from "@/app/_components/_shared/hooks/useIsMobile";
import { Card } from "@/app/_components/_shared/ui/card";
import {
	ChartContainer,
	ChartTooltip,
	ChartTooltipContent,
} from "@/app/_components/_shared/ui/chart";
import { formatUsd } from "@/lib/formatUsd";
import type { RevenueByCourseChartProps } from "./types";
import { truncateLabel } from "./utils";

const config = { grossCents: { label: "Revenue", color: "var(--chart-1)" } };

export default function RevenueByCourseChart({
	data,
	isLoading,
}: RevenueByCourseChartProps) {
	const isMobile = useIsMobile();
	const hasData = !!data && data.length > 0;
	return (
		<Card className="p-6">
			<div className="mb-4">
				<h2 className="font-semibold text-lg">Revenue by Course</h2>
				<p className="text-muted-foreground text-sm">Top earners in range</p>
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
					<BarChart
						data={data}
						layout="vertical"
						margin={{ left: 4, right: 12 }}
					>
						<CartesianGrid horizontal={false} />
						<XAxis hide type="number" />
						<YAxis
							axisLine={false}
							dataKey="title"
							interval={isMobile ? 0 : undefined}
							tickFormatter={(v: string) =>
								isMobile ? truncateLabel(v, 14) : v
							}
							tickLine={false}
							tickMargin={8}
							type="category"
							width={90}
						/>
						<ChartTooltip
							content={
								<ChartTooltipContent formatter={(value) => formatUsd(value)} />
							}
							cursor={false}
						/>
						<Bar
							dataKey="grossCents"
							fill="var(--color-grossCents)"
							radius={[0, 4, 4, 0]}
						/>
					</BarChart>
				</ChartContainer>
			)}
		</Card>
	);
}
