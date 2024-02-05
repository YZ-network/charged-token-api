import ethers from "ethers";

export function recordToEntryList(record: Record<string, string>): Array<{ key: string; value: string }> {
  return Object.entries(record).map(([key, value]) => ({
    key,
    value,
  }));
}

export function toGraphQL(record: Record<string, any> | Record<string, any>[]): Record<string, any> {
  if (record instanceof Array) {
    return record.map((obj) => toGraphQL(obj));
  }

  const copy = { ...record };
  for (const key in record) {
    if (typeof record[key] === "object") {
      copy[key] = recordToEntryList(record[key]);
    }
  }

  return copy;
}

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
