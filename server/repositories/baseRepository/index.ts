import { db as prisma } from "@/server/db";
import type { PrismaModel } from "@/server/repositories/baseRepository/prismaModel";
import type {
	Filter,
	FindFirstArgs,
	FindManyArgs,
	Repository,
} from "@/server/repositories/baseRepository/repository";

export default abstract class BaseRepository<T, TCreateDto, TUpdateDto>
	implements Repository<T, TCreateDto, TUpdateDto>
{
	protected abstract readonly model: keyof typeof prisma;

	protected readonly isSoftDelete: boolean = false;

	protected readonly logger?: {
		info: (message: string, meta?: Record<string, unknown>) => void;
		error: (message: string, meta?: Record<string, unknown>) => void;
		warn: (message: string, meta?: Record<string, unknown>) => void;
		debug: (message: string, meta?: Record<string, unknown>) => void;
	};

	/**
	 * Handles operation errors by logging the error and throwing a formatted error message
	 *
	 * @param error The caught error
	 * @param operation Description of the operation that failed
	 * @param context Additional context information for logging
	 * @throws Error with a formatted message
	 */
	protected handleError(
		error: unknown,
		operation: string,
		context: Record<string, unknown> = {},
	): never {
		// Log the error with context
		this.logger?.error(`Failed to ${operation}`, { ...context, error });

		// Format the error message
		const errorMessage = error instanceof Error ? error.message : String(error);

		// Throw a new error with the formatted message
		throw new Error(`Failed to ${operation}: ${errorMessage}`);
	}

	protected get repo() {
		return prisma[this.model] as unknown as PrismaModel;
	}

	protected get prisma() {
		return prisma;
	}

	public async create(dto: TCreateDto): Promise<T> {
		try {
			this.logger?.info("Creating entity", { dto });
			return (await this.repo.create({ data: dto })) as Promise<T>;
		} catch (error) {
			return this.handleError(error, "create entity", { dto });
		}
	}

	public async findFirst({
		where = {},
		orderBy,
		include = {},
	}: FindFirstArgs): Promise<T | null> {
		try {
			const result = await this.repo.findFirst({
				where: this.buildFilter(where),
				orderBy: orderBy ?? undefined,
				include,
			});
			return result as T | null;
		} catch (error) {
			return this.handleError(error, "find first entity", { where, orderBy });
		}
	}

	public async findMany({
		where = {},
		skip,
		take,
		orderBy,
		include,
		select,
	}: FindManyArgs): Promise<T[]> {
		try {
			this.logger?.debug("Finding entities", { where, skip, take, orderBy });
			const result = await this.repo.findMany({
				where: this.buildFilter(where),
				skip: skip ?? undefined,
				take: take ?? undefined,
				orderBy: orderBy ?? undefined,
				include,
				select,
			});
			return result as T[];
		} catch (error) {
			return this.handleError(error, "find entities", {
				where,
				skip,
				take,
				orderBy,
			});
		}
	}

	public async update(
		id: string,
		dto: TUpdateDto,
		idField: string = "id",
	): Promise<T> {
		try {
			this.logger?.info("Updating entity", { id, dto });
			return (await this.repo.update({
				where: { [idField]: id },
				data: dto,
			})) as Promise<T>;
		} catch (error) {
			return this.handleError(error, `update entity with ID ${id}`, {
				id,
				dto,
			});
		}
	}

	public async updateMany(filter: Filter, data: object): Promise<number> {
		try {
			this.logger?.info("Updating entities", { filter, data });

			if (!this.repo.updateMany) {
				// Fallback to individual updates if updateMany is not available
				const results = await Promise.all(
					(await this.findMany({ where: filter })).map((entity: T) => {
						// @ts-expect-error
						if (entity && typeof entity.id !== "undefined") {
							return this.repo.update({
								// @ts-expect-error
								where: { id: entity.id },
								data,
							});
						}

						return null;
					}),
				);

				return results.filter(Boolean).length;
			}

			const result = await this.repo.updateMany({
				where: this.buildFilter(filter),
				data,
			});

			return result.count;
		} catch (error) {
			return this.handleError(error, "update entities", { filter, data });
		}
	}

	public async deleteMany(
		filter: Filter = {},
		softDelete: boolean = this.isSoftDelete,
	): Promise<number> {
		try {
			this.logger?.info("Deleting entities", { filter, softDelete });

			if (softDelete) {
				// Verify model supports soft delete
				if (!this.isSoftDelete) {
					// Don't log an error here, just throw
					throw new Error("Soft delete not supported for this model");
				}

				// For soft delete, don't exclude already deleted records
				const baseFilter = { ...filter };
				if (this.repo.updateMany) {
					const { count } = await this.repo.updateMany({
						where: baseFilter,
						data: { deletedAt: new Date() },
					});

					return count;
				}
			} else if (this.repo.deleteMany) {
				const { count } = await this.repo.deleteMany({
					where: this.buildFilter(filter),
				});

				return count;
			}
			return 0;
		} catch (error) {
			// Special case for soft delete not supported error
			if (
				error instanceof Error &&
				error.message === "Soft delete not supported for this model"
			) {
				throw error; // Just rethrow without logging
			}
			return this.handleError(error, "delete entities", { filter, softDelete });
		}
	}

	public async delete(
		id: string,
		softDelete: boolean = this.isSoftDelete,
	): Promise<boolean> {
		try {
			this.logger?.info("Deleting entity", { id, softDelete });
			if (softDelete) {
				await this.repo.update({
					where: { id },
					data: { deletedAt: new Date() } as unknown as TUpdateDto,
				});
			} else {
				// Direct call to repo.delete instead of forceDelete to avoid nested error messages
				await this.repo.delete({ where: { id } });
			}
			return true;
		} catch (error) {
			return this.handleError(error, `delete entity with ID ${id}`, {
				id,
				softDelete,
			});
		}
	}

	public async count(filter: Filter = {}): Promise<number> {
		try {
			this.logger?.debug("Counting entities", { filter });
			return this.repo.count({ where: this.buildFilter(filter) });
		} catch (error) {
			return this.handleError(error, "count entities", { filter });
		}
	}

	public async transaction<R>(
		callback: (prismaClient: unknown) => Promise<R>,
	): Promise<R> {
		try {
			this.logger?.info("Starting transaction");
			const result = await prisma.$transaction(callback);
			this.logger?.info("Transaction completed successfully");
			return result;
		} catch (error) {
			return this.handleError(error, "execute transaction");
		}
	}

	protected buildFilter(filter: Filter = {}): Filter {
		const baseFilter = this.isSoftDelete ? { deletedAt: null } : {};
		return { ...baseFilter, ...filter };
	}
}
