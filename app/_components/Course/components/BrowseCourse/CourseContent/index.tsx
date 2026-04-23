"use client";

import { ChevronDown, ChevronUp, PlayCircle } from "lucide-react";
import { useState } from "react";
import { Button } from "@/app/_components/_shared/ui/button";
import {
	Card,
	CardContent,
	CardDescription,
	CardHeader,
	CardTitle,
} from "@/app/_components/_shared/ui/card";
import type { CourseContentProps } from "@/app/_components/Course/components/BrowseCourse/CourseContent/types";

const CourseContent = ({ curriculum }: CourseContentProps) => {
	const [expandedSections, setExpandedSections] = useState<number[]>([0]);

	const toggleSection = (index: number) => {
		setExpandedSections((prev) =>
			prev.includes(index) ? prev.filter((i) => i !== index) : [...prev, index],
		);
	};

	return (
		<Card>
			<CardHeader>
				<CardTitle>Course content</CardTitle>
				<CardDescription>
					{curriculum.reduce((acc, section) => acc + section.lectures, 0)}{" "}
					lectures
				</CardDescription>
			</CardHeader>
			<CardContent className="space-y-2">
				{curriculum.map((section, index) => (
					<div className="rounded-lg border" key={section.id}>
						<button
							className="flex w-full items-center justify-between p-4 text-left transition-colors hover:bg-muted/50"
							onClick={() => toggleSection(index)}
							type="button"
						>
							<div className="space-y-1">
								<h4 className="font-semibold">{section.section}</h4>
								<p className="text-muted-foreground text-sm">
									{section.lectures} lectures - {section.duration}
								</p>
							</div>
							{expandedSections.includes(index) ? (
								<ChevronUp className="h-5 w-5" />
							) : (
								<ChevronDown className="h-5 w-5" />
							)}
						</button>
						{expandedSections.includes(index) && (
							<div className="border-t">
								{section.lessons.map((lesson) => (
									<div
										className="flex items-center justify-between p-4 text-sm hover:bg-muted/50"
										key={lesson.id}
									>
										<div className="flex items-center gap-2">
											<PlayCircle className="h-4 w-4 text-muted-foreground" />
											<span>{lesson.title}</span>
										</div>
										<div className="flex items-center gap-2">
											{lesson.preview && (
												<Button size="sm" variant="ghost">
													Preview
												</Button>
											)}
											<span className="text-muted-foreground">
												{lesson.duration}
											</span>
										</div>
									</div>
								))}
							</div>
						)}
					</div>
				))}
			</CardContent>
		</Card>
	);
};

export default CourseContent;
