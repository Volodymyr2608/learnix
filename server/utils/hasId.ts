export const hasId = (entity: unknown): entity is { id: string | number } => {
	return typeof entity === "object" && entity !== null && "id" in entity;
};
