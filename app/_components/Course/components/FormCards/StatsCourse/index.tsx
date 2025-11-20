import {
	Card,
	CardContent,
	CardHeader,
	CardTitle,
} from "@/app/_components/_shared/ui/card";

const StatsCourse = () => {
	return (
		<Card>
			<CardHeader>
				<CardTitle>Course Stats</CardTitle>
			</CardHeader>
			<CardContent className="space-y-3 text-sm">
				<div className="flex justify-between">
					<span className="text-muted-foreground">Students</span>
					<span className="font-semibold">456</span>
				</div>
				<div className="flex justify-between">
					<span className="text-muted-foreground">Rating</span>
					<span className="font-semibold">4.9 ⭐</span>
				</div>
				<div className="flex justify-between">
					<span className="text-muted-foreground">Revenue</span>
					<span className="font-semibold">$4,560</span>
				</div>
			</CardContent>
		</Card>
	);
};

export default StatsCourse;
