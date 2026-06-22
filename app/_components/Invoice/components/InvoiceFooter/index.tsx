import { Text, View } from "@react-pdf/renderer";
import { styles } from "../../styles";
import type { InvoiceFooterProps } from "../../types";

export const InvoiceFooter = ({ paymentId }: InvoiceFooterProps) => {
	return (
		<View style={styles.footer}>
			<Text style={styles.footerThanks}>
				Thank you for learning with Learnix.
			</Text>
			<Text style={styles.footerText}>
				Questions about this invoice? Contact support@learnix.com
			</Text>
			<Text style={styles.footerText}>Payment reference: {paymentId}</Text>
		</View>
	);
};
