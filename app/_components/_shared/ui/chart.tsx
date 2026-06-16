"use client";

import type * as React from "react";
import { createContext, useContext, useId, useMemo } from "react";
import * as RechartsPrimitive from "recharts";

import { cn } from "@/lib/utils/cn";

export type ChartConfig = {
	[k in string]: {
		label?: React.ReactNode;
		icon?: React.ComponentType;
		color?: string;
	};
};

type ChartContextProps = { config: ChartConfig };

const ChartContext = createContext<ChartContextProps | null>(null);

function useChart() {
	const context = useContext(ChartContext);
	if (!context) {
		throw new Error("useChart must be used within a <ChartContainer />");
	}
	return context;
}

function ChartContainer({
	id,
	className,
	children,
	config,
	...props
}: React.ComponentProps<"div"> & {
	config: ChartConfig;
	children: React.ComponentProps<
		typeof RechartsPrimitive.ResponsiveContainer
	>["children"];
}) {
	const uniqueId = useId();
	const chartId = `chart-${id ?? uniqueId.replace(/:/g, "")}`;
	const style = useMemo(() => {
		return Object.entries(config)
			.filter(([, v]) => v.color)
			.map(([key, v]) => `--color-${key}: ${v.color};`)
			.join(" ");
	}, [config]);

	return (
		<ChartContext.Provider value={{ config }}>
			<div
				className={cn(
					"flex aspect-video justify-center text-xs [&_.recharts-cartesian-axis-tick_text]:fill-muted-foreground [&_.recharts-cartesian-grid_line[stroke='#ccc']]:stroke-border/50",
					className,
				)}
				data-chart={chartId}
				{...props}
			>
				<style
					dangerouslySetInnerHTML={{
						__html: `[data-chart=${chartId}]{${style}}`,
					}}
				/>
				<RechartsPrimitive.ResponsiveContainer>
					{children}
				</RechartsPrimitive.ResponsiveContainer>
			</div>
		</ChartContext.Provider>
	);
}

const ChartTooltip = RechartsPrimitive.Tooltip;

function ChartTooltipContent({
	active,
	payload,
	label,
	labelFormatter,
	formatter,
	className,
}: {
	active?: boolean;
	payload?: Array<{
		name?: string;
		value?: number;
		dataKey?: string;
		color?: string;
	}>;
	label?: string;
	labelFormatter?: (label: string) => React.ReactNode;
	formatter?: (value: number, name?: string) => React.ReactNode;
	className?: string;
}) {
	const { config } = useChart();
	if (!active || !payload?.length) return null;

	return (
		<div
			className={cn(
				"grid min-w-[8rem] gap-1.5 rounded-lg border bg-background px-2.5 py-1.5 text-xs shadow-md",
				className,
			)}
		>
			{label && (
				<div className="font-medium">
					{labelFormatter ? labelFormatter(label) : label}
				</div>
			)}
			{payload.map((item) => {
				const key = item.dataKey ?? item.name ?? "value";
				const itemConfig = config[key];
				return (
					<div className="flex items-center justify-between gap-3" key={key}>
						<span className="flex items-center gap-1.5 text-muted-foreground">
							<span
								className="h-2 w-2 rounded-[2px]"
								style={{ backgroundColor: item.color ?? `var(--color-${key})` }}
							/>
							{itemConfig?.label ?? item.name}
						</span>
						<span className="font-medium font-mono tabular-nums">
							{formatter && typeof item.value === "number"
								? formatter(item.value, item.name)
								: item.value}
						</span>
					</div>
				);
			})}
		</div>
	);
}

export { ChartContainer, ChartTooltip, ChartTooltipContent, useChart };
