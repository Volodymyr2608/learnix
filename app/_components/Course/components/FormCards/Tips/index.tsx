import {
	Card,
	CardContent,
	CardHeader,
	CardTitle,
} from "@/app/_components/_shared/ui/card";

const Tips = () => {
	return (
		<Card>
			<CardHeader>
				<CardTitle>Tips for Success</CardTitle>
			</CardHeader>
			<CardContent className="space-y-2 text-muted-foreground text-sm">
				<p>• Use clear, descriptive titles</p>
				<p>• Add high-quality thumbnails</p>
				<p>• Structure content logically</p>
				<p>• Include practice exercises</p>
			</CardContent>
		</Card>
	);
};

export default Tips;
