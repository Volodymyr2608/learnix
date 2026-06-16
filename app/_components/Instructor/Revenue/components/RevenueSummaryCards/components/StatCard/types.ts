import type * as React from "react";

export type StatCardProps = {
	label: string;
	value: string;
	icon: React.ReactNode;
	iconWrapperClassName: string;
	subline?: React.ReactNode;
};
