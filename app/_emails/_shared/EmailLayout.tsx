import { Body, Container, Head, Hr, Html, Row, Section, Text } from "@react-email/components";
import { EmailFooter } from "./EmailFooter";

export function EmailLayout({
	unsubscribeUrl,
	children,
}: {
	unsubscribeUrl?: string;
	children: React.ReactNode;
}) {
	return (
		<Html>
			<Head />
			<Body
				style={{
					background: "#f6f6f6",
					fontFamily: "ui-sans-serif, system-ui",
				}}
			>
				<Container
					style={{
						background: "#fff",
						padding: 32,
						maxWidth: 560,
						margin: "0 auto",
					}}
				>
					<Section style={{ marginBottom: 24 }}>
						<Row>
							<Text
								style={{
									color: "#111827",
									fontSize: 20,
									fontWeight: 700,
									margin: 0,
									padding: 0,
								}}
							>
								📖 Learnix
							</Text>
						</Row>
					</Section>
					{children}
					<Hr style={{ borderColor: "#e5e7eb", margin: "24px 0" }} />
					<EmailFooter unsubscribeUrl={unsubscribeUrl} />
				</Container>
			</Body>
		</Html>
	);
}
