import { DirectoryModel } from "../../models";

export const DirectoryQueryResolver = async (_: any, { chainId }: { chainId: number }) => {
  const directory = await DirectoryModel.findOne({ chainId });

  if (directory === null) {
    return null;
  }

  return DirectoryModel.toGraphQL(directory);
};
