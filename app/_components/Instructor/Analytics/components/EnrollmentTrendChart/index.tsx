"use client";

import { format, parseISO } from "date-fns";
import { Area, AreaChart, CartesianGrid, XAxis, YAxis } from "recharts";
import { Card } from "@/app/_components/_shared/ui/card";
import {
	ChartContainer,
	ChartTooltip,
	ChartTooltipContent,
} from "@/app/_components/_shared/ui/chart";
import type { EnrollmentTrendChartProps } from "./types";

const config = {
	enrollments: { label: "Enrollments", color: "var(--chart-1)" },
	completions: { label: "Completions", color: "var(--chart-2)" },
};

export default function EnrollmentTrendChart({
	data,
	isLoading,
}: EnrollmentTrendChartProps) {
	return (
		<Card className="p-6">
			<div className="mb-4">
				<h2 className="font-semibold text-lg">Enrollments & Completions</h2>
				<p className="text-muted-foreground text-sm">
					New enrollments and completions over time
				</p>
			</div>
			{isLoading && (
				<div className="h-[300px] animate-pulse rounded-lg bg-muted" />
			)}
			{!isLoading && (
				<ChartContainer className="h-[300px] w-full" config={config}>
					<AreaChart data={data ?? []} margin={{ left: 4, right: 4 }}>
						<defs>
							<linearGradient id="fillEnroll" x1="0" x2="0" y1="0" y2="1">
								<stop
									offset="5%"
									stopColor="var(--color-enrollments)"
									stopOpacity={0.8}
								/>
								<stop
									offset="95%"
									stopColor="var(--color-enrollments)"
									stopOpacity={0.1}
								/>
							</linearGradient>
							<linearGradient id="fillComplete" x1="0" x2="0" y1="0" y2="1">
								<stop
									offset="5%"
									stopColor="var(--color-completions)"
									stopOpacity={0.8}
								/>
								<stop
									offset="95%"
									stopColor="var(--color-completions)"
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
						<YAxis axisLine={false} tickLine={false} tickMargin={8} />
						<ChartTooltip
							content={
								<ChartTooltipContent
									labelFormatter={(l) => format(parseISO(l), "MMM yyyy")}
								/>
							}
							cursor={false}
						/>
						<Area
							dataKey="completions"
							fill="url(#fillComplete)"
							stroke="var(--color-completions)"
							strokeWidth={2}
							type="monotone"
						/>
						<Area
							dataKey="enrollments"
							fill="url(#fillEnroll)"
							stroke="var(--color-enrollments)"
							strokeWidth={2}
							type="monotone"
						/>
					</AreaChart>
				</ChartContainer>
			)}
		</Card>
	);
}
