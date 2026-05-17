import { Text, View } from "@react-pdf/renderer";
import { styles } from "../styles";

type Props = {
	studentName: string;
	courseTitle: string;
	instructorName: string;
};

export function CertificateBody({ studentName, courseTitle, instructorName }: Props) {
	return (
		<View style={styles.body}>
			<Text style={styles.bodyPresented}>This certifies that</Text>
			<Text style={styles.bodyName}>{studentName}</Text>
			<Text style={styles.bodyCompleted}>has successfully completed</Text>
			<Text style={styles.bodyCourseTitle}>{courseTitle}</Text>
			<Text style={styles.bodyInstructor}>Instructor: {instructorName}</Text>
		</View>
	);
}