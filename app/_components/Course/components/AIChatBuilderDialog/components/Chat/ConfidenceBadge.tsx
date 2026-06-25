import { Badge } from "@/app/_components/_shared/ui/badge";

const confidenceTone = (value: number) => {
	if (value >= 0.8) return "default";
	if (value >= 0.5) return "secondary";
	return "outline";
};

export const ConfidenceBadge = ({ value }: { value: number }) => {
	const pct = Math.round(value * 100);
	return <Badge variant={confidenceTone(value)}>AI is {pct}% confident</Badge>;
};
