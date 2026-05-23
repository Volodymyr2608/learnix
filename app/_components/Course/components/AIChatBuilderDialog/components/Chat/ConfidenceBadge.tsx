import { Badge } from "@/app/_components/_shared/ui/badge";

export const ConfidenceBadge = ({ value }: { value: number }) => {
	const pct = Math.round(value * 100);
	const tone =
		value >= 0.8 ? "default" : value >= 0.5 ? "secondary" : "outline";
	return <Badge variant={tone}>AI is {pct}% confident</Badge>;
};
