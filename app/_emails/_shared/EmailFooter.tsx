import { Link, Section, Text } from "@react-email/components";

export function EmailFooter({ unsubscribeUrl }: { unsubscribeUrl?: string }) {
	return (
		<Section style={{ marginTop: 24 }}>
			<Text style={{ color: "#6b7280", fontSize: 12, textAlign: "center" }}>
				Learnix · 123 Learning Lane, San Francisco CA 94105
			</Text>
			{unsubscribeUrl && (
				<Text style={{ color: "#6b7280", fontSize: 12, textAlign: "center" }}>
					<Link href={unsubscribeUrl} style={{ color: "#6b7280" }}>
						Unsubscribe
					</Link>
				</Text>
			)}
		</Section>
	);
}
