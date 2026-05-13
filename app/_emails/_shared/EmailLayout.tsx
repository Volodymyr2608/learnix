import {
	Body,
	Container,
	Head,
	Hr,
	Html,
	Img,
	Section,
} from "@react-email/components";
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
					<Section>
						<Img
							alt="Learnix"
							height={32}
							src="https://learnix.app/logo.png"
							width={120}
						/>
					</Section>
					{children}
					<Hr style={{ borderColor: "#e5e7eb", margin: "24px 0" }} />
					<EmailFooter unsubscribeUrl={unsubscribeUrl} />
				</Container>
			</Body>
		</Html>
	);
}
