import { Badge } from "app/_components/_shared/ui/badge";
import { CheckCircle2, XCircle } from "lucide-react";
import type { Attempt } from "../../types";

export default function AttemptBadge({ attempt }: { attempt: Attempt }) {
	if (attempt.isCorrect) {
		return (
			<Badge className="border-transparent bg-green-500 text-white">
				<CheckCircle2 />
				Correct
			</Badge>
		);
	}

	return (
		<Badge variant="destructive">
			<XCircle />
			Incorrect
		</Badge>
	);
}
