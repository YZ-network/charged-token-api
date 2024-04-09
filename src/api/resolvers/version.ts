import { ApiVersion } from "../../config";

export const VersionQueryResolver = async (_: any, args: any) => {
  return ApiVersion;
};
