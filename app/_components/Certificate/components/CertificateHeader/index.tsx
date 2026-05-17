import { Text, View } from "@react-pdf/renderer";
import { styles } from "../../styles";

export const CertificateHeader = () => {
	return (
		<View style={styles.header}>
			<Text style={styles.headerTitle}>Certificate of Completion</Text>
			<Text style={styles.headerSubtitle}>Learnix</Text>
		</View>
	);
};