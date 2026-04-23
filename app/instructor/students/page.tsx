"use client";

import {
	ArrowUpDown,
	BookOpen,
	CheckCircle2,
	Clock,
	Download,
	Eye,
	Filter,
	GraduationCap,
	Mail,
	MoreHorizontal,
	Search,
	TrendingUp,
	Users,
	XCircle,
} from "lucide-react";
import { useState } from "react";
import {
	Avatar,
	AvatarFallback,
	AvatarImage,
} from "@/app/_components/_shared/ui/avatar";
import { Badge } from "@/app/_components/_shared/ui/badge";
import { Button } from "@/app/_components/_shared/ui/button";
import { Card } from "@/app/_components/_shared/ui/card";
import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogHeader,
	DialogTitle,
} from "@/app/_components/_shared/ui/dialog";
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuItem,
	DropdownMenuLabel,
	DropdownMenuSeparator,
	DropdownMenuTrigger,
} from "@/app/_components/_shared/ui/dropdown-menu";
import { Input } from "@/app/_components/_shared/ui/input";
import { Progress } from "@/app/_components/_shared/ui/progress";
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@/app/_components/_shared/ui/select";

// Mock student data
const studentsData = [
	{
		id: 1,
		name: "Sarah Johnson",
		email: "sarah.johnson@email.com",
		avatar: "/professional-woman-smiling.png",
		enrolledCourses: [
			{
				id: 1,
				title: "Complete Web Development Bootcamp",
				progress: 75,
				status: "active",
			},
			{
				id: 2,
				title: "Advanced React Patterns",
				progress: 30,
				status: "active",
			},
		],
		totalProgress: 52,
		enrolledDate: "2024-01-15",
		lastActive: "2 hours ago",
		status: "active",
	},
	{
		id: 2,
		name: "Michael Chen",
		email: "michael.chen@email.com",
		avatar: "/professional-man-smiling.png",
		enrolledCourses: [
			{
				id: 1,
				title: "Complete Web Development Bootcamp",
				progress: 100,
				status: "completed",
			},
			{
				id: 3,
				title: "Python for Data Science",
				progress: 45,
				status: "active",
			},
		],
		totalProgress: 72,
		enrolledDate: "2023-11-20",
		lastActive: "1 day ago",
		status: "active",
	},
	{
		id: 3,
		name: "Emma Wilson",
		email: "emma.wilson@email.com",
		avatar: "/professional-woman-designer.png",
		enrolledCourses: [
			{
				id: 2,
				title: "Advanced React Patterns",
				progress: 90,
				status: "active",
			},
		],
		totalProgress: 90,
		enrolledDate: "2024-02-01",
		lastActive: "5 hours ago",
		status: "active",
	},
	{
		id: 4,
		name: "James Rodriguez",
		email: "james.rodriguez@email.com",
		avatar: null,
		enrolledCourses: [
			{
				id: 1,
				title: "Complete Web Development Bootcamp",
				progress: 15,
				status: "active",
			},
		],
		totalProgress: 15,
		enrolledDate: "2024-03-10",
		lastActive: "1 week ago",
		status: "inactive",
	},
	{
		id: 5,
		name: "Lisa Park",
		email: "lisa.park@email.com",
		avatar: null,
		enrolledCourses: [
			{
				id: 3,
				title: "Python for Data Science",
				progress: 100,
				status: "completed",
			},
			{
				id: 2,
				title: "Advanced React Patterns",
				progress: 100,
				status: "completed",
			},
		],
		totalProgress: 100,
		enrolledDate: "2023-09-05",
		lastActive: "3 days ago",
		status: "completed",
	},
	{
		id: 6,
		name: "David Kim",
		email: "david.kim@email.com",
		avatar: null,
		enrolledCourses: [
			{
				id: 1,
				title: "Complete Web Development Bootcamp",
				progress: 60,
				status: "active",
			},
			{
				id: 3,
				title: "Python for Data Science",
				progress: 25,
				status: "active",
			},
		],
		totalProgress: 42,
		enrolledDate: "2024-01-28",
		lastActive: "12 hours ago",
		status: "active",
	},
	{
		id: 7,
		name: "Anna Martinez",
		email: "anna.martinez@email.com",
		avatar: null,
		enrolledCourses: [
			{
				id: 2,
				title: "Advanced React Patterns",
				progress: 50,
				status: "active",
			},
		],
		totalProgress: 50,
		enrolledDate: "2024-02-15",
		lastActive: "4 hours ago",
		status: "active",
	},
	{
		id: 8,
		name: "Robert Brown",
		email: "robert.brown@email.com",
		avatar: null,
		enrolledCourses: [
			{
				id: 1,
				title: "Complete Web Development Bootcamp",
				progress: 5,
				status: "active",
			},
		],
		totalProgress: 5,
		enrolledDate: "2024-03-18",
		lastActive: "2 weeks ago",
		status: "inactive",
	},
];

const courses = [
	{ id: "all", title: "All Courses" },
	{ id: "1", title: "Complete Web Development Bootcamp" },
	{ id: "2", title: "Advanced React Patterns" },
	{ id: "3", title: "Python for Data Science" },
];

export default function InstructorStudentsPage() {
	const [searchQuery, setSearchQuery] = useState("");
	const [statusFilter, setStatusFilter] = useState("all");
	const [courseFilter, setCourseFilter] = useState("all");
	const [sortBy, setSortBy] = useState("recent");
	const [selectedStudent, setSelectedStudent] = useState<
		(typeof studentsData)[0] | null
	>(null);
	const [detailsOpen, setDetailsOpen] = useState(false);

	// Filter and sort students
	const filteredStudents = studentsData
		.filter((student) => {
			const matchesSearch =
				student.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
				student.email.toLowerCase().includes(searchQuery.toLowerCase());
			const matchesStatus =
				statusFilter === "all" || student.status === statusFilter;
			const matchesCourse =
				courseFilter === "all" ||
				student.enrolledCourses.some((c) => String(c.id) === courseFilter);
			return matchesSearch && matchesStatus && matchesCourse;
		})
		.sort((a, b) => {
			switch (sortBy) {
				case "name":
					return a.name.localeCompare(b.name);
				case "progress":
					return b.totalProgress - a.totalProgress;
				default:
					return (
						new Date(b.enrolledDate).getTime() -
						new Date(a.enrolledDate).getTime()
					);
			}
		});

	const stats = {
		total: studentsData.length,
		active: studentsData.filter((s) => s.status === "active").length,
		completed: studentsData.filter((s) => s.status === "completed").length,
		inactive: studentsData.filter((s) => s.status === "inactive").length,
	};

	const handleViewDetails = (student: (typeof studentsData)[0]) => {
		setSelectedStudent(student);
		setDetailsOpen(true);
	};

	const getStatusColor = (status: string) => {
		switch (status) {
			case "active":
				return "bg-green-500/10 text-green-600 border-green-500/20";
			case "completed":
				return "bg-blue-500/10 text-blue-600 border-blue-500/20";
			case "inactive":
				return "bg-gray-500/10 text-gray-600 border-gray-500/20";
			default:
				return "bg-gray-500/10 text-gray-600 border-gray-500/20";
		}
	};

	const getInitials = (name: string) => {
		return name
			.split(" ")
			.map((n) => n[0])
			.join("")
			.toUpperCase();
	};

	return (
		<div className="space-y-6">
			{/* Header */}
			<div className="flex items-center justify-between">
				<div>
					<h1 className="font-bold text-3xl">Students</h1>
					<p className="text-muted-foreground">
						Manage and track your students&apos; progress
					</p>
				</div>
				<Button variant="outline">
					<Download className="mr-2 h-4 w-4" />
					Export Data
				</Button>
			</div>

			{/* Stats Cards */}
			<div className="grid gap-4 md:grid-cols-4">
				<Card className="p-4">
					<div className="flex items-center gap-3">
						<div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10">
							<Users className="h-5 w-5 text-primary" />
						</div>
						<div>
							<p className="text-muted-foreground text-sm">Total Students</p>
							<p className="font-bold text-2xl">{stats.total}</p>
						</div>
					</div>
				</Card>
				<Card className="p-4">
					<div className="flex items-center gap-3">
						<div className="flex h-10 w-10 items-center justify-center rounded-lg bg-green-500/10">
							<TrendingUp className="h-5 w-5 text-green-600" />
						</div>
						<div>
							<p className="text-muted-foreground text-sm">Active Learners</p>
							<p className="font-bold text-2xl">{stats.active}</p>
						</div>
					</div>
				</Card>
				<Card className="p-4">
					<div className="flex items-center gap-3">
						<div className="flex h-10 w-10 items-center justify-center rounded-lg bg-blue-500/10">
							<GraduationCap className="h-5 w-5 text-blue-600" />
						</div>
						<div>
							<p className="text-muted-foreground text-sm">Completed</p>
							<p className="font-bold text-2xl">{stats.completed}</p>
						</div>
					</div>
				</Card>
				<Card className="p-4">
					<div className="flex items-center gap-3">
						<div className="flex h-10 w-10 items-center justify-center rounded-lg bg-gray-500/10">
							<Clock className="h-5 w-5 text-gray-600" />
						</div>
						<div>
							<p className="text-muted-foreground text-sm">Inactive</p>
							<p className="font-bold text-2xl">{stats.inactive}</p>
						</div>
					</div>
				</Card>
			</div>

			{/* Filters */}
			<Card className="p-4">
				<div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
					<div className="relative flex-1 md:max-w-sm">
						<Search className="absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
						<Input
							className="pl-9"
							onChange={(e) => setSearchQuery(e.target.value)}
							placeholder="Search students..."
							value={searchQuery}
						/>
					</div>
					<div className="flex flex-wrap items-center gap-3">
						<Select onValueChange={setStatusFilter} value={statusFilter}>
							<SelectTrigger className="w-[140px]">
								<Filter className="mr-2 h-4 w-4" />
								<SelectValue placeholder="Status" />
							</SelectTrigger>
							<SelectContent>
								<SelectItem value="all">All Status</SelectItem>
								<SelectItem value="active">Active</SelectItem>
								<SelectItem value="completed">Completed</SelectItem>
								<SelectItem value="inactive">Inactive</SelectItem>
							</SelectContent>
						</Select>
						<Select onValueChange={setCourseFilter} value={courseFilter}>
							<SelectTrigger className="w-[220px]">
								<BookOpen className="mr-2 h-4 w-4" />
								<SelectValue placeholder="Course" />
							</SelectTrigger>
							<SelectContent>
								{courses.map((course) => (
									<SelectItem key={course.id} value={course.id}>
										{course.title}
									</SelectItem>
								))}
							</SelectContent>
						</Select>
						<Select onValueChange={setSortBy} value={sortBy}>
							<SelectTrigger className="w-[160px]">
								<ArrowUpDown className="mr-2 h-4 w-4" />
								<SelectValue placeholder="Sort by" />
							</SelectTrigger>
							<SelectContent>
								<SelectItem value="recent">Most Recent</SelectItem>
								<SelectItem value="name">Name</SelectItem>
								<SelectItem value="progress">Progress</SelectItem>
							</SelectContent>
						</Select>
					</div>
				</div>
			</Card>

			{/* Students Table */}
			<Card>
				<div className="overflow-x-auto">
					<table className="w-full">
						<thead>
							<tr className="border-b bg-muted/50">
								<th className="px-6 py-4 text-left font-medium text-muted-foreground text-sm">
									Student
								</th>
								<th className="px-6 py-4 text-left font-medium text-muted-foreground text-sm">
									Enrolled Courses
								</th>
								<th className="px-6 py-4 text-left font-medium text-muted-foreground text-sm">
									Progress
								</th>
								<th className="px-6 py-4 text-left font-medium text-muted-foreground text-sm">
									Last Active
								</th>
								<th className="px-6 py-4 text-left font-medium text-muted-foreground text-sm">
									Status
								</th>
								<th className="px-6 py-4 text-right font-medium text-muted-foreground text-sm">
									Actions
								</th>
							</tr>
						</thead>
						<tbody>
							{filteredStudents.map((student) => (
								<tr
									className="border-b last:border-0 hover:bg-muted/30"
									key={student.id}
								>
									<td className="px-6 py-4">
										<div className="flex items-center gap-3">
											<Avatar className="h-10 w-10">
												<AvatarImage
													alt={student.name}
													src={student.avatar || undefined}
												/>
												<AvatarFallback className="bg-primary/10 text-primary">
													{getInitials(student.name)}
												</AvatarFallback>
											</Avatar>
											<div>
												<p className="font-medium">{student.name}</p>
												<p className="text-muted-foreground text-sm">
													{student.email}
												</p>
											</div>
										</div>
									</td>
									<td className="px-6 py-4">
										<div className="flex flex-wrap gap-1">
											{student.enrolledCourses.slice(0, 2).map((course) => (
												<Badge
													className="text-xs"
													key={course.id}
													variant="secondary"
												>
													{course.title.length > 20
														? `${course.title.substring(0, 20)}...`
														: course.title}
												</Badge>
											))}
											{student.enrolledCourses.length > 2 && (
												<Badge className="text-xs" variant="outline">
													+{student.enrolledCourses.length - 2} more
												</Badge>
											)}
										</div>
									</td>
									<td className="px-6 py-4">
										<div className="flex items-center gap-3">
											<Progress
												className="w-24"
												value={student.totalProgress}
											/>
											<span className="font-medium text-sm">
												{student.totalProgress}%
											</span>
										</div>
									</td>
									<td className="px-6 py-4">
										<span className="text-muted-foreground text-sm">
											{student.lastActive}
										</span>
									</td>
									<td className="px-6 py-4">
										<Badge
											className={getStatusColor(student.status)}
											variant="outline"
										>
											{student.status.charAt(0).toUpperCase() +
												student.status.slice(1)}
										</Badge>
									</td>
									<td className="px-6 py-4 text-right">
										<DropdownMenu>
											<DropdownMenuTrigger asChild>
												<Button size="icon" variant="ghost">
													<MoreHorizontal className="h-4 w-4" />
												</Button>
											</DropdownMenuTrigger>
											<DropdownMenuContent align="end">
												<DropdownMenuLabel>Actions</DropdownMenuLabel>
												<DropdownMenuSeparator />
												<DropdownMenuItem
													onClick={() => handleViewDetails(student)}
												>
													<Eye className="mr-2 h-4 w-4" />
													View Details
												</DropdownMenuItem>
												<DropdownMenuItem>
													<Mail className="mr-2 h-4 w-4" />
													Send Message
												</DropdownMenuItem>
											</DropdownMenuContent>
										</DropdownMenu>
									</td>
								</tr>
							))}
						</tbody>
					</table>
				</div>
				{filteredStudents.length === 0 && (
					<div className="flex flex-col items-center justify-center py-12">
						<Users className="h-12 w-12 text-muted-foreground" />
						<p className="mt-4 font-medium text-lg">No students found</p>
						<p className="text-muted-foreground text-sm">
							Try adjusting your search or filter criteria
						</p>
					</div>
				)}
			</Card>

			{/* Student Details Dialog */}
			<Dialog onOpenChange={setDetailsOpen} open={detailsOpen}>
				<DialogContent className="max-w-2xl">
					{selectedStudent && (
						<>
							<DialogHeader>
								<DialogTitle>Student Details</DialogTitle>
								<DialogDescription>
									View detailed information about this student
								</DialogDescription>
							</DialogHeader>
							<div className="space-y-6 py-4">
								{/* Student Info */}
								<div className="flex items-center gap-4">
									<Avatar className="h-16 w-16">
										<AvatarImage
											alt={selectedStudent.name}
											src={selectedStudent.avatar || undefined}
										/>
										<AvatarFallback className="bg-primary/10 text-primary text-xl">
											{getInitials(selectedStudent.name)}
										</AvatarFallback>
									</Avatar>
									<div>
										<h3 className="font-semibold text-xl">
											{selectedStudent.name}
										</h3>
										<p className="text-muted-foreground">
											{selectedStudent.email}
										</p>
										<div className="mt-1 flex items-center gap-2">
											<Badge
												className={getStatusColor(selectedStudent.status)}
												variant="outline"
											>
												{selectedStudent.status.charAt(0).toUpperCase() +
													selectedStudent.status.slice(1)}
											</Badge>
											<span className="text-muted-foreground text-sm">
												Joined{" "}
												{new Date(
													selectedStudent.enrolledDate,
												).toLocaleDateString("en-US", {
													month: "short",
													day: "numeric",
													year: "numeric",
												})}
											</span>
										</div>
									</div>
								</div>

								{/* Overall Progress */}
								<div className="rounded-lg border p-4">
									<div className="flex items-center justify-between">
										<span className="font-medium">Overall Progress</span>
										<span className="font-bold text-lg">
											{selectedStudent.totalProgress}%
										</span>
									</div>
									<Progress
										className="mt-2 h-2"
										value={selectedStudent.totalProgress}
									/>
									<p className="mt-2 text-muted-foreground text-sm">
										Last active: {selectedStudent.lastActive}
									</p>
								</div>

								{/* Enrolled Courses */}
								<div>
									<h4 className="mb-3 font-medium">Enrolled Courses</h4>
									<div className="space-y-3">
										{selectedStudent.enrolledCourses.map((course) => (
											<div className="rounded-lg border p-4" key={course.id}>
												<div className="flex items-start justify-between">
													<div className="flex-1">
														<div className="flex items-center gap-2">
															<h5 className="font-medium">{course.title}</h5>
															{course.status === "completed" ? (
																<CheckCircle2 className="h-4 w-4 text-green-600" />
															) : course.progress < 20 ? (
																<XCircle className="h-4 w-4 text-gray-400" />
															) : null}
														</div>
														<div className="mt-2 flex items-center gap-3">
															<Progress
																className="flex-1"
																value={course.progress}
															/>
															<span className="font-medium text-sm">
																{course.progress}%
															</span>
														</div>
													</div>
												</div>
												<div className="mt-2">
													<Badge
														className={
															course.status === "completed"
																? "border-green-500/20 bg-green-500/10 text-green-600"
																: "border-blue-500/20 bg-blue-500/10 text-blue-600"
														}
														variant="outline"
													>
														{course.status === "completed"
															? "Completed"
															: "In Progress"}
													</Badge>
												</div>
											</div>
										))}
									</div>
								</div>

								{/* Actions */}
								<div className="flex gap-3">
									<Button className="flex-1">
										<Mail className="mr-2 h-4 w-4" />
										Send Message
									</Button>
									<Button className="flex-1" variant="outline">
										<Download className="mr-2 h-4 w-4" />
										Export Progress
									</Button>
								</div>
							</div>
						</>
					)}
				</DialogContent>
			</Dialog>
		</div>
	);
}
