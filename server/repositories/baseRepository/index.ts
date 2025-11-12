import { db as prisma } from "@/server/db";
import type { PrismaModel } from "@/server/repositories/baseRepository/prismaModel";
import type {
	Filter,
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

	public async create(dto: TCreateDto): Promise<T> {
		try {
			this.logger?.info("Creating entity", { dto });
			return (await this.repo.create({ data: dto })) as Promise<T>;
		} catch (error) {
			return this.handleError(error, "create entity", { dto });
		}
	}

	public async findFirst(
		where: Filter = {},
		orderBy?: OrderBy,
		include: object | null = {},
	): Promise<T | null> {
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

  public async transaction<R>(callback: (prismaClient: unknown) => Promise<R>): Promise<R> {
    try {
      this.logger?.info('Starting transaction');
      const result = await prisma.$transaction(callback);
      this.logger?.info('Transaction completed successfully');
      return result;
    } catch (error) {
      return this.handleError(error, 'execute transaction');
    }
  }

	protected buildFilter(filter: Filter = {}): Filter {
		const baseFilter = this.isSoftDelete ? { deletedAt: null } : {};
		return { ...baseFilter, ...filter };
	}
}
