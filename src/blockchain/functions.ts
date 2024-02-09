import ethers from "ethers";

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
