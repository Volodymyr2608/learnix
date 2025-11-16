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

const RequirementsForm = () => {
	return (
		<Card>
			<CardHeader>
				<CardTitle>Requirements</CardTitle>
				<CardDescription>
					What students need before taking this course
				</CardDescription>
			</CardHeader>
			<CardContent className="space-y-4">
				{[1, 2].map((i) => (
					<div className="flex gap-2" key={i}>
						<Input placeholder={`Requirement ${i}`} />
						<Button size="icon" variant="ghost">
							<Trash2 className="h-4 w-4" />
						</Button>
					</div>
				))}
				<Button className="w-full bg-transparent" variant="outline">
					<Plus className="mr-2 h-4 w-4" />
					Add Requirement
				</Button>
			</CardContent>
		</Card>
	);
};

export default RequirementsForm;
