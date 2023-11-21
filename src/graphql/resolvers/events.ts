import { EventModel } from "../../models";

export const EventsQueryResolver = async (
  _: any,
  { chainId, offset, count }: { chainId: number; offset?: number; count?: number },
) => {
  if (offset === undefined) offset = 0;
  if (count === undefined) count = 20;

  const events = await EventModel.find({ chainId })
    .limit(count)
    .skip(offset)
    .sort({ blockNumber: "asc", txIndex: "asc", logIndex: "asc" });

  return events.map((event) => EventModel.toGraphQL(event));
};

export const EventsCountQueryResolver = async (_: any, { chainId }: { chainId: number }) => {
  return await EventModel.count({ chainId });
};
