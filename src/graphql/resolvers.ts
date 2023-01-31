import { Repeater } from "graphql-yoga";
import { recordToEntryList } from "../functions";
import { ChargedTokenModel, DirectoryModel, IDirectory } from "../models";
import pubSub from "./pubsub";

const DirectoryQueryResolver = async () => {
  const directory = await DirectoryModel.findOne();

  if (directory === null) {
    throw new Error("No directory yet.");
  }

  const jsonDirectory: IDirectory = directory.toJSON();

  return {
    ...jsonDirectory,
    projectRelatedToLT: recordToEntryList(jsonDirectory.projectRelatedToLT),
    whitelist: recordToEntryList(jsonDirectory.projectRelatedToLT),
  };
};

const allChargedTokensResolver = async () => {
  const cts = await ChargedTokenModel.find();

  const jsonCTs = cts.map((ct) => {
    const jsonCT = ct.toJSON();
    return {
      ...jsonCT,
      balances: recordToEntryList(jsonCT.balances),
    };
  });

  return jsonCTs;
};

const DirectorySubscriptionResolver = {
  subscribe: async () => {
    const sub = pubSub.subscribe("Directory");
    //const timerId = await pushDirUpdatesUsingPubSub();

    return new Repeater(async (push, stop) => {
      let done = false;

      stop.then((err) => {
        //clearInterval(timerId);
        sub.return();
        done = true;
        console.error("stopped by", err);
      });

      try {
        for await (const value of sub) {
          console.log("sending to subscription");
          await push(value);
        }
        console.log("subscription ended");
      } catch (err) {
        console.error("stopped with error", err);
        stop("sub closed");
      }
    });
  },
  resolve: (payload: any) => payload,
};

const resolvers = {
  Query: {
    Directory: DirectoryQueryResolver,
    allChargedTokens: allChargedTokensResolver,
  },
  Subscription: {
    Directory: DirectorySubscriptionResolver,
  },
};

export default resolvers;
