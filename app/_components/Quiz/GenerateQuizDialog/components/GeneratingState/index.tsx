import { Loader2 } from "lucide-react";

export function GeneratingState() {
	return (
		<div className="flex flex-col items-center justify-center gap-3 py-16 text-muted-foreground">
			<Loader2 className="h-8 w-8 animate-spin" />
			<p>Reading lesson and writing questions…</p>
		</div>
	);
}
