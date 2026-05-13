import { Button } from "@react-email/components";

export function EmailButton({
	href,
	children,
}: {
	href: string;
	children: React.ReactNode;
}) {
	return (
		<Button
			href={href}
			style={{
				backgroundColor: "#4f46e5",
				borderRadius: 6,
				color: "#fff",
				display: "inline-block",
				fontSize: 14,
				fontWeight: 600,
				padding: "12px 24px",
				textDecoration: "none",
			}}
		>
			{children}
		</Button>
	);
}