export type StudentsTablePaginationProps = {
	currentPage: number;
	lastPage: number;
	onPageChange: (page: number) => void;
};
