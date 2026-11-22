/** EC-12 (W12): what the student reads before deleting an account with open refund appeals. */
export const openAppealWarning = (courseTitles: string[]): string | null => {
	if (courseTitles.length === 0) return null;
	if (courseTitles.length === 1)
		return `You have an open refund appeal for ${courseTitles[0]}; deleting your account closes it.`;
	const list = `${courseTitles.slice(0, -1).join(", ")} and ${courseTitles.at(-1)}`;
	return `You have open refund appeals for ${list}; deleting your account closes them.`;
};
