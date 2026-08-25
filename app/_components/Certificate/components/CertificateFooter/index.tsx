import { Text, View } from "@react-pdf/renderer";
import { styles } from "../../styles";
import type { CertificateFooterProps } from "./types";

export const CertificateFooter = ({
	completedAt,
	enrollmentId,
}: CertificateFooterProps) => {
	const dateStr = completedAt.toLocaleDateString("en-US", {
		year: "numeric",
		month: "long",
		day: "numeric",
	});
	return (
		<View style={styles.footer}>
			<Text style={styles.footerText}>Issued: {dateStr}</Text>
			<Text style={styles.footerText}>ID: {enrollmentId}</Text>
		</View>
	);
};
