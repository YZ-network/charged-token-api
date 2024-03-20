import { type Plugin } from "graphql-yoga";
import { Metrics } from "../metrics";

export function usePrometheus(): Plugin {
  return {
    async onRequest({ request, endResponse }) {
      if (request.method === "GET") {
        const path = request.url.split("/");
        if (path.length === 4 && path[3] === "metrics") {
          const response = new Response(Metrics.dumpMetrics());
          endResponse(response);
        }
      }
    },
  };
}
