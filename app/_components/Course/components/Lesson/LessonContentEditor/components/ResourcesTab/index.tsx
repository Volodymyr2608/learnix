import { Download, Plus, Trash2 } from "lucide-react";
import { Button } from "@/app/_components/_shared/ui/button";
import {
	Card,
	CardContent,
	CardDescription,
	CardHeader,
	CardTitle,
} from "@/app/_components/_shared/ui/card";
import { Input } from "@/app/_components/_shared/ui/input";
import type { ResourcesTabProps } from "./types";

export const ResourcesTab = ({
	resources,
	onAdd,
	onRemove,
	onUpdate,
}: ResourcesTabProps) => {
	return (
		<Card>
			<CardHeader>
				<div className="flex items-center justify-between">
					<div>
						<CardTitle>Downloadable Resources</CardTitle>
						<CardDescription>
							Add files students can download (PDFs, code files, etc.)
						</CardDescription>
					</div>
					<Button onClick={onAdd} size="sm">
						<Plus className="mr-2 h-4 w-4" />
						Add Resource
					</Button>
				</div>
			</CardHeader>
			<CardContent>
				<div className="space-y-3">
					{resources.map((resource) => (
						<div
							className="flex items-center gap-3 rounded-lg border p-4"
							key={resource.id}
						>
							<Download className="h-5 w-5 text-muted-foreground" />
							<div className="flex-1 space-y-1">
								<Input
									className="font-medium"
									onChange={(e) =>
										onUpdate(resource.id, { name: e.target.value })
									}
									value={resource.name}
								/>
								<div className="flex gap-2">
									<Input
										className="w-24 text-sm"
										onChange={(e) =>
											onUpdate(resource.id, { type: e.target.value })
										}
										placeholder="Type"
										value={resource.type}
									/>
									<Input className="text-sm" type="file" />
								</div>
							</div>
							<Button
								onClick={() => onRemove(resource.id)}
								size="icon"
								variant="ghost"
							>
								<Trash2 className="h-4 w-4 text-destructive" />
							</Button>
						</div>
					))}
					{resources.length === 0 && (
						<div className="py-8 text-center text-muted-foreground">
							No resources added yet. Click "Add Resource" to get started.
						</div>
					)}
				</div>
			</CardContent>
		</Card>
	);
};
