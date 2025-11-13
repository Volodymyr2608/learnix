const generateListWithIds = (count: number) =>
	Array.from({ length: count }, (_, index) => ({ id: index }));

export default generateListWithIds;
