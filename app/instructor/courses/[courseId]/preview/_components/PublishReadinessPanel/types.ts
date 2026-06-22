import type { Readiness } from "@/lib/course/publishReadiness";

export type PublishReadinessPanelProps = {
	readiness: Readiness;
	isPublished: boolean;
};

export type ReadinessStatusMessageProps = {
	readiness: Readiness;
	isPublished: boolean;
};
