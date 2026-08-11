"use client";

import { Loader2 } from "lucide-react";
import { useState } from "react";
import { Button } from "@/app/_components/_shared/ui/button";
import {
	Card,
	CardContent,
	CardDescription,
	CardHeader,
	CardTitle,
} from "@/app/_components/_shared/ui/card";
import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogFooter,
	DialogHeader,
	DialogTitle,
	DialogTrigger,
} from "@/app/_components/_shared/ui/dialog";
import { Input } from "@/app/_components/_shared/ui/input";
import { Label } from "@/app/_components/_shared/ui/label";
import useDangerZone from "@/app/_components/Account/DangerZoneSection/hooks/useDangerZone";

const DangerZoneSection = () => {
	const { open, setOpen, isPending, deleteAccount } = useDangerZone();
	const [password, setPassword] = useState("");

	const handleDelete = () => {
		if (!password) return;
		void deleteAccount(password);
	};

	return (
		<Card className="border-destructive/50">
			<CardHeader>
				<CardTitle className="text-destructive">Danger zone</CardTitle>
				<CardDescription>
					Permanently delete your account. This action cannot be undone. Courses
					you published stay online and on sale, so enrolled students keep their
					access.
				</CardDescription>
			</CardHeader>
			<CardContent>
				<Dialog onOpenChange={setOpen} open={open}>
					<DialogTrigger asChild>
						<Button variant="destructive">Delete account</Button>
					</DialogTrigger>

					<DialogContent>
						<DialogHeader>
							<DialogTitle>Delete your account</DialogTitle>
							<DialogDescription>
								This permanently removes your name, email address, sign-in
								credentials, and your AI tutor and course-builder chat history.
								Courses you published, your students' progress in them, and
								messages you exchanged with other people are kept — the other
								party keeps their own correspondence. Enter your password to
								confirm.
							</DialogDescription>
						</DialogHeader>

						<div className="space-y-2">
							<Label htmlFor="confirm-password">Password</Label>
							<Input
								id="confirm-password"
								onChange={(e) => setPassword(e.target.value)}
								placeholder="••••••••"
								type="password"
								value={password}
							/>
						</div>

						<DialogFooter>
							<Button onClick={() => setOpen(false)} variant="outline">
								Cancel
							</Button>
							<Button
								disabled={isPending || !password}
								onClick={handleDelete}
								variant="destructive"
							>
								{isPending ? <Loader2 className="animate-spin" /> : null}
								Delete permanently
							</Button>
						</DialogFooter>
					</DialogContent>
				</Dialog>
			</CardContent>
		</Card>
	);
};

export default DangerZoneSection;
