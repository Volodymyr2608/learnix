import {
	Card,
	CardContent,
	CardHeader,
	CardTitle,
} from "@/app/_components/_shared/ui/card";

const OwnCoursesStats = () => {
	return (
		<div className="grid gap-4 md:grid-cols-4">
			<Card>
				<CardHeader className="pb-2">
					<CardTitle className="font-medium text-sm">Total Courses</CardTitle>
				</CardHeader>
				<CardContent>
					<div className="font-bold text-2xl">8</div>
					<p className="text-muted-foreground text-xs">+1 this month</p>
				</CardContent>
			</Card>
			<Card>
				<CardHeader className="pb-2">
					<CardTitle className="font-medium text-sm">Published</CardTitle>
				</CardHeader>
				<CardContent>
					<div className="font-bold text-2xl">6</div>
					<p className="text-muted-foreground text-xs">2 drafts</p>
				</CardContent>
			</Card>
			<Card>
				<CardHeader className="pb-2">
					<CardTitle className="font-medium text-sm">Total Students</CardTitle>
				</CardHeader>
				<CardContent>
					<div className="font-bold text-2xl">1,234</div>
					<p className="text-muted-foreground text-xs">+87 this month</p>
				</CardContent>
			</Card>
			<Card>
				<CardHeader className="pb-2">
					<CardTitle className="font-medium text-sm">Total Revenue</CardTitle>
				</CardHeader>
				<CardContent>
					<div className="font-bold text-2xl">$12,450</div>
					<p className="text-muted-foreground text-xs">+$1,230 this month</p>
				</CardContent>
			</Card>
		</div>
	);
};

export default OwnCoursesStats;
