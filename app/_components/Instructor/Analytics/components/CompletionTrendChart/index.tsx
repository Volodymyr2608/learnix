"use client";

import { format, parseISO } from "date-fns";
import { CartesianGrid, Line, LineChart, XAxis, YAxis } from "recharts";
import { Card } from "@/app/_components/_shared/ui/card";
import {
	ChartContainer,
	ChartTooltip,
	ChartTooltipContent,
} from "@/app/_components/_shared/ui/chart";
import type { CompletionTrendChartProps } from "./types";

const config = { rate: { label: "Completion Rate", color: "var(--chart-1)" } };

export default function CompletionTrendChart({
	data,
	isLoading,
}: CompletionTrendChartProps) {
	return (
		<Card className="p-6">
			<div className="mb-4">
				<h2 className="font-semibold text-lg">Completion Rate Trend</h2>
				<p className="text-muted-foreground text-sm">
					Share of each cohort that completed
				</p>
			</div>
			{isLoading && (
				<div className="h-[244px] animate-pulse rounded-lg bg-muted" />
			)}
			{!isLoading && (
				<ChartContainer className="h-[244px] w-full" config={config}>
					<LineChart data={data ?? []} margin={{ left: 4, right: 8 }}>
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
							domain={[0, 100]}
							tickFormatter={(v: number) => `${v}%`}
							tickLine={false}
							tickMargin={8}
						/>
						<ChartTooltip
							content={
								<ChartTooltipContent
									labelFormatter={(l) => format(parseISO(l), "MMM yyyy")}
								/>
							}
							cursor={false}
						/>
						<Line
							dataKey="rate"
							dot={false}
							stroke="var(--color-rate)"
							strokeWidth={2}
							type="monotone"
						/>
					</LineChart>
				</ChartContainer>
			)}
		</Card>
	);
}
