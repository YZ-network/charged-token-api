import type ethers from "ethers";
import { rootLogger } from "../rootLogger";

const log = rootLogger.child({ name: "Utils" });

function getBlockDateWrapper(): (blockNumber: number, provider: ethers.providers.JsonRpcProvider) => Promise<string> {
  const blockDates: Record<number, string> = {};

  async function getBlockDate(blockNumber: number, provider: ethers.providers.JsonRpcProvider): Promise<string> {
    if (blockDates[blockNumber] === undefined) {
      const block = await provider.getBlock(blockNumber);
      const blockDate = new Date(block.timestamp * 1000).toISOString();
      blockDates[blockNumber] = blockDate;
    }
    return blockDates[blockNumber];
  }

  return getBlockDate;
}

export const getBlockDate = getBlockDateWrapper();

export function detectNegativeAmount(
  chainId: number,
  dataType: DataType,
  data: Record<string, string>,
  fieldsToCheck: string[],
  logData: Record<string, any> = {},
) {
  const faultyFields: Record<string, string> = {};
  fieldsToCheck.forEach((field) => {
    if (data[field] !== undefined && data[field].startsWith("-")) {
      faultyFields[field] = data[field];
    }
  });

  if (Object.keys(faultyFields).length > 0) {
    log.error({
      msg: `Invalid update detected : negative amounts in ${dataType}`,
      chainId,
      dataType,
      ...logData,
      faultyFields,
    });
    throw new Error(`Invalid update detected : negative amounts in ${dataType}`);
  }
}
