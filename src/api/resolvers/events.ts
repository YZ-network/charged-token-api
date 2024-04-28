import { AbstractDbRepository } from "../../core/AbstractDbRepository";
import { validateChainId } from "./validateChainId";

export type EventsQueryResolver = (
  _: any,
  { chainId, offset, count }: { chainId: number; offset?: number; count?: number },
) => Promise<any[]>;

export const EventsQueryResolverFactory =
  (db: AbstractDbRepository) =>
  async (_: any, { chainId, offset, count }: { chainId: number; offset?: number; count?: number }) => {
    validateChainId(chainId);

    if (offset === undefined) offset = 0;
    if (count === undefined) count = 20;

    const events = await db.getEventsPaginated(chainId, count, offset);

    return events;
  };

export type EventsCountQueryResolver = (_: any, { chainId }: { chainId: number }) => Promise<number>;

export const EventsCountQueryResolverFactory =
  (db: AbstractDbRepository) =>
  async (_: any, { chainId }: { chainId: number }) => {
    validateChainId(chainId);
    return await db.countEvents(chainId);
  };
