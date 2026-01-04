import { db as prisma } from "@/server/db";
import type Paginator from "@/server/repositories/baseRepository/paginator";
import type { PrismaModel } from "@/server/repositories/baseRepository/prismaModel";
import type {
	Filter,
	FindFirstArgs,
	FindManyArgs,
	OrderBy,
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

	public async findOne(
		id: string,
		include: object | null | undefined = {},
		idField: string = "id",
	): Promise<T> {
		try {
			return (await this.repo.findUniqueOrThrow({
				where: { [idField]: id },
				include,
			})) as Promise<T>;
		} catch (error) {
			return this.handleError(error, `find entity with ID ${id}`, { id });
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

	public async create(dto: TCreateDto): Promise<T> {
		try {
			this.logger?.info("Creating entity", { dto });
			return (await this.repo.create({ data: dto })) as Promise<T>;
		} catch (error) {
			return this.handleError(error, "create entity", { dto });
		}
	}

	public async bulkCreate(dtos: TCreateDto[]): Promise<number> {
		try {
			this.logger?.info("Bulk creating entities", { count: dtos.length });

			if (!this.repo.createMany) {
				// Fallback to individual creates if createMany is not available
				const results = await Promise.all(dtos.map((dto) => this.create(dto)));
				return results.length;
			}

			const result = await this.repo.createMany({
				data: dtos as unknown as unknown[],
			});
			return result.count;
		} catch (error) {
			return this.handleError(error, "bulk create entities", {
				count: dtos.length,
			});
		}
	}

	public async createManyAndReturn(dtos: TCreateDto[]): Promise<T[]> {
		try {
			this.logger?.info("Creating entities", { count: dtos.length });

			if (!this.repo.createManyAndReturn) {
				// Fallback to individual creates if createMany is not available
				return await Promise.all(dtos.map((dto) => this.create(dto)));
			}

			return (await this.repo.createManyAndReturn({ data: dtos })) as Promise<
				T[]
			>;
		} catch (error) {
			return this.handleError(error, "crete many and return entities", {
				count: dtos.length,
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

	public async bulkUpdate(ids: string[], dto: TUpdateDto): Promise<number> {
		try {
			this.logger?.info("Bulk updating entities", { ids, dto });

			if (!this.repo.updateMany) {
				// Fallback to individual updates if updateMany is not available
				const results = await Promise.all(
					ids.map((id) => this.update(id, dto)),
				);
				return results.length;
			}

			const result = await this.repo.updateMany({
				where: { id: { in: ids } },
				data: dto as unknown as unknown,
			});
			return result.count;
		} catch (error) {
			return this.handleError(error, "bulk update entities", { ids, dto });
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

	public async forceDelete(id: string): Promise<boolean> {
		try {
			this.logger?.info("Force deleting entity", { id });
			await this.repo.delete({ where: { id } });
			return true;
		} catch (error) {
			return this.handleError(error, `force delete entity with ID ${id}`, {
				id,
			});
		}
	}

	public async bulkDelete(
		ids: string[],
		softDelete: boolean = this.isSoftDelete,
	): Promise<number> {
		try {
			this.logger?.info("Bulk deleting entities", { ids, softDelete });

			if (softDelete) {
				if (!this.repo.updateMany) {
					// Fallback to individual soft deletes
					const results = await Promise.all(
						ids.map((id) => this.delete(id, true)),
					);
					return results.filter(Boolean).length;
				}

				const result = await this.repo.updateMany({
					where: { id: { in: ids } },
					data: { deletedAt: new Date() } as unknown as unknown,
				});
				return result.count;
			} else {
				if (!this.repo.deleteMany) {
					// Fallback to individual hard deletes
					const results = await Promise.all(
						ids.map((id) => this.forceDelete(id)),
					);
					return results.filter(Boolean).length;
				}

				const result = await this.repo.deleteMany({
					where: { id: { in: ids } },
				});
				return result.count;
			}
		} catch (error) {
			return this.handleError(error, "bulk delete entities", {
				ids,
				softDelete,
			});
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

	public async count(filter: Filter = {}): Promise<number> {
		try {
			this.logger?.debug("Counting entities", { filter });
			return this.repo.count({ where: this.buildFilter(filter) });
		} catch (error) {
			return this.handleError(error, "count entities", { filter });
		}
	}

	public async paginate(
		perPage: number = 10,
		page: number = 1,
		filter: Filter = {},
		orderBy: OrderBy = { id: "asc" },
	): Promise<Paginator<T>> {
		try {
			this.logger?.debug("Paginating entities", {
				perPage,
				page,
				filter,
				orderBy,
			});
			const total = await this.count(filter);
			const result = await this.repo.findMany({
				where: this.buildFilter(filter),
				skip: (page - 1) * perPage,
				take: perPage,
				orderBy,
			});
			const data = result as T[];

			return {
				data,
				total,
				currentPage: page,
				lastPage: Math.ceil(total / perPage),
				perPage,
				from: (page - 1) * perPage,
				to: (page - 1) * perPage + data.length,
			};
		} catch (error) {
			return this.handleError(error, "paginate entities", {
				perPage,
				page,
				filter,
				orderBy,
			});
		}
	}

	public async restore(id: string): Promise<T> {
		try {
			if (!this.isSoftDelete) {
				this.logger?.error("Restore not supported", { id });
				throw new Error("Restore not supported for this repository");
			}

			this.logger?.info("Restoring entity", { id });
			return (await this.repo.update({
				where: { id },
				data: { deletedAt: null } as unknown as TUpdateDto,
			})) as Promise<T>;
		} catch (error) {
			// Special case for restore not supported error
			if (
				error instanceof Error &&
				error.message === "Restore not supported for this repository"
			) {
				throw error; // Just rethrow without additional formatting
			}
			return this.handleError(error, `restore entity with ID ${id}`, { id });
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
