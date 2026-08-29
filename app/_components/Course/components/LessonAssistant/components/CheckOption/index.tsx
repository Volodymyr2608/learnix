"use client";

import { optionClassName } from "@/app/_components/Quiz/QuestionCard/helpers/optionClassName";
import type { CheckOptionProps } from "./types";

/**
 * One answer option.
 *
 * The text is rendered as a plain string and never as markdown. It is
 * model-authored text going into a browser, which is the whole class of problem
 * markdown rendering opens — a link, an image, an embedded tag — and plain text
 * closes it outright rather than filtering it.
 *
 * Styling is reused from the quiz's `optionClassName` rather than duplicated, so
 * the two places a student picks an answer cannot drift apart visually.
 */
export const CheckOption = ({
	option,
	isSelected,
	isLocked,
	onSelect,
}: CheckOptionProps) => {
	const handleClick = () => onSelect(option);

	return (
		<button
			className={optionClassName(
				option,
				null,
				isSelected ? option : null,
				isLocked,
			)}
			disabled={isLocked}
			onClick={handleClick}
			type="button"
		>
			{option}
		</button>
	);
};
