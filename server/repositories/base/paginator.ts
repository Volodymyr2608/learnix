export default interface Paginator<T> {
	data: T[];
	total: number;
	currentPage: number;
	lastPage: number;
	perPage: number;
	from: number;
	to: number;
}
