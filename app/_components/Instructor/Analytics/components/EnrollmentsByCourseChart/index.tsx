"use client";

import { Cell, Pie, PieChart } from "recharts";
import { Card } from "@/app/_components/_shared/ui/card";
import {
	ChartContainer,
	ChartTooltip,
	ChartTooltipContent,
} from "@/app/_components/_shared/ui/chart";
import type { EnrollmentsByCourseChartProps } from "./types";

const COLORS = [
	"var(--chart-1)",
	"var(--chart-2)",
	"var(--chart-3)",
	"var(--chart-4)",
	"var(--chart-5)",
];

export default function EnrollmentsByCourseChart({
	data,
	isLoading,
}: EnrollmentsByCourseChartProps) {
	const items = data ?? [];
	const total = items.reduce((s, i) => s + i.enrollments, 0);
	return (
		<Card className="p-6">
			<div className="mb-4">
				<h2 className="font-semibold text-lg">Enrollments by Course</h2>
				<p className="text-muted-foreground text-sm">
					How enrollments split across your courses
				</p>
			</div>
			{isLoading && (
				<div className="h-[200px] animate-pulse rounded-lg bg-muted" />
			)}
			{!isLoading && total === 0 && (
				<p className="py-12 text-center text-muted-foreground text-sm">
					No enrollments in this range yet.
				</p>
			)}
			{!isLoading && total > 0 && (
				<div className="flex flex-col items-center gap-6 sm:flex-row">
					<ChartContainer className="aspect-square h-[200px]" config={{}}>
						<PieChart>
							<ChartTooltip
								content={<ChartTooltipContent hideLabel />}
								cursor={false}
							/>
							<Pie
								data={items}
								dataKey="enrollments"
								innerRadius={50}
								nameKey="title"
								strokeWidth={4}
							>
								{items.map((item, i) => (
									<Cell fill={COLORS[i % COLORS.length]} key={item.courseId} />
								))}
							</Pie>
						</PieChart>
					</ChartContainer>
					<ul className="flex-1 space-y-3">
						{items.map((item, i) => (
							<li className="flex items-center gap-3" key={item.courseId}>
								<span
									className="h-3 w-3 shrink-0 rounded-sm"
									style={{ backgroundColor: COLORS[i % COLORS.length] }}
								/>
								<span className="flex-1 truncate text-sm">{item.title}</span>
								<span className="font-medium text-muted-foreground text-sm">
									{Math.round((item.enrollments / total) * 100)}%
								</span>
							</li>
						))}
					</ul>
				</div>
			)}
		</Card>
	);
}
