"use client";

import { Plus, Trash2 } from "lucide-react";
import { Button } from "@/app/_components/_shared/ui/button";
import {
	Card,
	CardContent,
	CardDescription,
	CardHeader,
	CardTitle,
} from "@/app/_components/_shared/ui/card";
import { Input } from "@/app/_components/_shared/ui/input";

const LearningObjectivesForm = () => {
	return (
		<Card>
			<CardHeader>
				<CardTitle>What Students Will Learn</CardTitle>
				<CardDescription>Add learning objectives (at least 4)</CardDescription>
			</CardHeader>
			<CardContent className="space-y-4">
				{[1, 2, 3, 4].map((i) => (
					<div className="flex gap-2" key={i}>
						<Input placeholder={`Learning objective ${i}`} />
						<Button size="icon" variant="ghost">
							<Trash2 className="h-4 w-4" />
						</Button>
					</div>
				))}
				<Button className="w-full bg-transparent" variant="outline">
					<Plus className="mr-2 h-4 w-4" />
					Add Learning Objective
				</Button>
			</CardContent>
		</Card>
	);
};

export default LearningObjectivesForm;
