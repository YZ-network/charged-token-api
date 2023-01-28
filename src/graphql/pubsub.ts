import { createPubSub } from "graphql-yoga";
import { IDirectory } from "../models";
import { IKeyValueList } from "../types";

interface IDirectoryData
  extends Omit<IDirectory, "whitelist" | "projectRelatedToLT"> {
  count?: number;
  projectRelatedToLT: IKeyValueList;
  whitelist: IKeyValueList;
}

/*
const pubSub = createPubSub<{
  Directory: [Directory: IDirectoryData];
}>();
*/

const pubSub = createPubSub();

export default pubSub;
