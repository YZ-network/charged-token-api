import { AbstractDbRepository } from "../../loaders/AbstractDbRepository";

export const EventsQueryResolverFactory =
  (db: AbstractDbRepository) =>
  async (_: any, { chainId, offset, count }: { chainId: number; offset?: number; count?: number }) => {
    if (offset === undefined) offset = 0;
    if (count === undefined) count = 20;

    const events = await db.getEventsPaginated(chainId, count, offset);

    return events; // TODO convert to graphql format
  };

export const EventsCountQueryResolverFactory =
  (db: AbstractDbRepository) =>
  async (_: any, { chainId }: { chainId: number }) => {
    return await db.countEvents(chainId);
  };
