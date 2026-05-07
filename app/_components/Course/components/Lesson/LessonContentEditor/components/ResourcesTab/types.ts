import type { Resource } from "../../types";

export interface ResourcesTabProps {
	resources: Resource[];
	onAdd: () => void;
	onRemove: (id: string) => void;
	onUpdate: (id: string, changes: Partial<Resource>) => void;
}
