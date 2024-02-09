import { stringify } from "csv-stringify/sync";
import { type Plugin } from "graphql-yoga";
import { AbstractDbRepository } from "./core/AbstractDbRepository";

export const eventsExporterFactory = (db: AbstractDbRepository) =>
  function useEventsExporter(): Plugin {
    return {
      async onRequest({ request, endResponse }) {
        if (request.method === "GET") {
          const path = request.url.split("/");
          if (path.length === 4 && path[3] === "export") {
            const allEvents = await db.getAllEvents();
            const keys: string[] = [
              "chainId",
              "blockDate",
              "blockNumber",
              "txIndex",
              "logIndex",
              "status",
              "contract",
              "address",
              "name",
              "args",
              "txHash",
              "topics",
            ];
            const data = stringify(
              [
                keys,
                ...allEvents.map((event: any) =>
                  keys.map((key) => {
                    if (key === "args") {
                      return event.args.map((arg: any) => JSON.stringify(arg)).toString();
                    }
                    return event[key].toString();
                  }),
                ),
              ],
              {
                delimiter: ";",
              },
            );
            const response = new Response(data);
            response.headers.set("Content-Type", "text/csv");
            response.headers.set("Content-Disposition", "attachment; filename=ct-api_events_export.csv");
            endResponse(response);
          }
        }
      },
    };
  };
