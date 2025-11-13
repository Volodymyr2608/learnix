const getInitials = (name?: string | null): string => {
	if (!name) return "NN";

	const parts = name.trim().split(" ").filter(Boolean);

	if (parts.length === 1) {
		return parts[0].slice(0, 2).toUpperCase();
	}

	return (parts[0][0] + parts[1][0]).toUpperCase();
};

export default getInitials;
