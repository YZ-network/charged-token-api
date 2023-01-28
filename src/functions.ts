import { pubSub } from "./graphql";
import { DirectoryModel, IDirectory } from "./models";

export function recordToEntryList(
  record: Record<string, string>
): { key: string; value: string }[] {
  return Object.entries(record).map(([key, value]) => ({
    key,
    value,
  }));
}

export async function pushDirUpdatesUsingPubSub() {
  let count = 0;
  const directory = await DirectoryModel.findOne().exec();

  if (directory === null) {
    throw new Error("No directory yet.");
  }

  const jsonDirectory: IDirectory = directory.toJSON();

  console.log("starting pushing directory updates");

  return setInterval(() => {
    console.log("pushing directory", count);
    pubSub.publish("Directory", {
      count: count++,
      ...jsonDirectory,
      projectRelatedToLT: recordToEntryList(jsonDirectory.projectRelatedToLT),
      whitelist: recordToEntryList(jsonDirectory.projectRelatedToLT),
    });
  }, 3000);
}
