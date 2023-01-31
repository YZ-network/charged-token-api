import { Repeater } from "graphql-yoga";
import { recordToEntryList } from "../functions";
import {
  ChargedTokenModel,
  DelegableToLTModel,
  DirectoryModel,
  IDirectory,
  InterfaceProjectTokenModel,
} from "../models";
import { IModel } from "../types";
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

class ResolverFactory {
  static findAll<T>(model: IModel<T>) {
    return async () => {
      const results = await model.find();
      return results.map((result) => model.toGraphQL(result));
    };
  }

  static findByAddress<T>(model: IModel<T>) {
    return async (_, [address]: [string]) => {
      const result = await model.findOne({ address });
      if (result !== null) {
        return model.toGraphQL(result);
      }
    };
  }

  static subscribeByName(modelName: string) {
    return {
      subscribe: async () => {
        const sub = pubSub.subscribe(modelName);

        return new Repeater(async (push, stop) => {
          stop.then((err) => {
            sub.return();
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
  }

  static subscribeByNameAndAddress(modelName: string) {
    return {
      subscribe: async (_, { address }: { address: string }) => {
        const sub = pubSub.subscribe(`${modelName}.${address}`);

        return new Repeater(async (push, stop) => {
          stop.then((err) => {
            sub.return();
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
  }
}

const resolvers = {
  Query: {
    Directory: DirectoryQueryResolver,
    allChargedTokens: ResolverFactory.findAll(ChargedTokenModel),
    ChargedToken: ResolverFactory.findByAddress(ChargedTokenModel),
    allInterfaceProjectTokens: ResolverFactory.findAll(
      InterfaceProjectTokenModel
    ),
    InterfaceProjectToken: ResolverFactory.findByAddress(
      InterfaceProjectTokenModel
    ),
    allDelegableToLTs: ResolverFactory.findAll(DelegableToLTModel),
    DelegableToLT: ResolverFactory.findByAddress(DelegableToLTModel),
  },
  Subscription: {
    Directory: ResolverFactory.subscribeByName("Directory"),
    ChargedToken: ResolverFactory.subscribeByNameAndAddress("ChargedToken"),
    InterfaceProjectToken: ResolverFactory.subscribeByNameAndAddress(
      "InterfaceProjectToken"
    ),
    DelegableToLT: ResolverFactory.subscribeByNameAndAddress("DelegableToLT"),
  },
};

export default resolvers;
