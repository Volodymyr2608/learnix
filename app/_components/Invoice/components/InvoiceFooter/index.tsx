import { Text, View } from "@react-pdf/renderer";
import { styles } from "../../styles";
import type { InvoiceFooterProps } from "../../types";

export const InvoiceFooter = ({
	paymentId,
	purchasedAt,
}: InvoiceFooterProps) => {
	const dateStr = purchasedAt.toLocaleDateString("en-US", {
		year: "numeric",
		month: "long",
		day: "numeric",
	});
	return (
		<View style={styles.footer}>
			<Text style={styles.footerText}>Date: {dateStr}</Text>
			<Text style={styles.footerText}>Invoice ID: {paymentId}</Text>
		</View>
	);
};
