import { Text, View } from "@react-pdf/renderer";
import { styles } from "../../styles";

export const InvoiceHeader = () => {
	return (
		<View style={styles.header}>
			<Text style={styles.brand}>Learnix</Text>
			<Text style={styles.headerTitle}>Invoice</Text>
		</View>
	);
};
