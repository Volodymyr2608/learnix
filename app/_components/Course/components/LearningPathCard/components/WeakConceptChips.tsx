type WeakConceptChipsProps = {
	concepts: string[];
};

export const WeakConceptChips = ({ concepts }: WeakConceptChipsProps) => {
	if (concepts.length === 0) return null;
	return (
		<div className="mt-2 flex flex-wrap gap-1">
			{concepts.map((c) => (
				<span
					className="rounded-full bg-orange-100 px-2 py-0.5 text-orange-700 text-xs dark:bg-orange-900 dark:text-orange-300"
					key={c}
				>
					{c}
				</span>
			))}
		</div>
	);
};
