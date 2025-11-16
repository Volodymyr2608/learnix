const getInitials = (name?: string | null): string => {
	if (!name) return "NN";

	const parts = name.trim().split(" ").filter(Boolean);

	if (parts.length === 1 && parts[0]) {
		return parts[0].slice(0, 2).toUpperCase();
	}

	if (parts[0] && parts[1]) {
		const firstLetter = parts[0][0];
		const lastLetter = parts[1][0];
		return firstLetter && lastLetter
			? (firstLetter + lastLetter).toUpperCase()
			: "NN";
	}

	return "NN";
};

export default getInitials;
