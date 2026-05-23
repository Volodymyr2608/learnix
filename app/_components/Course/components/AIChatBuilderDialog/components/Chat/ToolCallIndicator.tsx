const LABELS: Record<string, string> = {
	search_similar_courses: "Searching similar courses…",
	fetch_instructor_prior_courses: "Reviewing your prior courses…",
	validate_curriculum_coherence: "Checking curriculum coherence…",
	lookup_category_taxonomy: "Looking up categories…",
	classify_intent: "Analyzing your message…",
	revise_prior_field: "Updating earlier step…",
	assess_completion: "Checking completeness…",
	extract_step_data: "Extracting step data…",
	validate: "Validating…",
	confidence_score: "Scoring confidence…",
};

export const ToolCallIndicator = ({ name }: { name: string }) => {
	const label = LABELS[name] ?? `Calling ${name}…`;
	return (
		<div className="inline-flex animate-pulse items-center gap-2 text-muted-foreground text-xs">
			<span className="h-1.5 w-1.5 rounded-full bg-muted-foreground" />
			{label}
		</div>
	);
};
