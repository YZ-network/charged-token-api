import { ethers } from "ethers";
import { Logger } from "pino";
import { rootLogger } from "../rootLogger";

export class ReorgDetector {
  private readonly chainId: number;
  private readonly provider: ethers.providers.JsonRpcProvider;
  private readonly log: Logger;

  blockNumberBeforeDisconnect: number = 0;
  blocksMap: Record<number, ethers.providers.Block> = {};
  blocksByHashMap: Record<string, ethers.providers.Block> = {};

  constructor(chainId: number, provider: ethers.providers.JsonRpcProvider) {
    this.chainId = chainId;
    this.provider = provider;
    this.log = rootLogger.child({ chainId, name: "Reorgs" });

    this.start();
  }

  start() {
    if (this.provider === undefined) {
      throw new Error("No provider to subscribe for new blocks !");
    }

    this.provider.on("block", (blockNumber: number) => this.onNewBlock(blockNumber));
  }

  destroy() {
    this.provider.off("block");
    this.blocksMap = {};
  }

  private async onNewBlock(blockNumber: number) {
    this.log.debug({
      msg: "New block header",
      blockNumber,
      blockNumberBeforeDisconnect: this.blockNumberBeforeDisconnect,
    });
    if (this.blockNumberBeforeDisconnect < blockNumber) {
      this.log.debug({
        msg: "updating block number before disconnect",
        blockNumber,
        blockNumberBeforeDisconnect: this.blockNumberBeforeDisconnect,
      });
      this.blockNumberBeforeDisconnect = blockNumber;
    }

    try {
      const lastBlock = await this.provider?.getBlock(blockNumber);

      if (lastBlock === undefined) {
        this.log.warn({
          msg: "Failed reading new block",
          blockNumber,
          lastBlock,
        });
        return;
      }

      this.checkBlockNumber(blockNumber, lastBlock);
      await this.addBlockAndDetectReorg(blockNumber, lastBlock);
    } catch (err) {
      this.log.warn({ msg: "Failed reading new block data", blockNumber, err });
    }
  }

  private checkBlockNumber(blockNumber: number, lastBlock: ethers.providers.Block) {
    if (lastBlock.number !== blockNumber) {
      throw new Error("Fetched block number doesn't match header !");
    } else {
      this.log.debug({
        msg: "Fetched new block",
        blockNumber,
        lastBlock,
      });
      this.blocksByHashMap[lastBlock.hash] = lastBlock;
    }
  }

  private async addBlockAndDetectReorg(blockNumber: number, lastBlock: ethers.providers.Block) {
    const previousBlockNumber = Object.keys(this.blocksMap)
      .map(Number)
      .reduce((prev, cur) => {
        return Number(prev) > cur ? Number(prev) : cur;
      }, 0);

    const knownBlock = this.blocksMap[blockNumber];
    if (knownBlock === undefined) {
      this.blocksMap[blockNumber] = lastBlock;
    } else if (knownBlock.number === lastBlock.number) {
      if (knownBlock.hash === lastBlock.hash) {
        this.log.debug({
          msg: "Duplicate block notification",
          blockNumber,
          lastBlock,
          knownBlock,
        });
      } else {
        await this.logReorgDelta(lastBlock);
      }
    } else if (blockNumber !== previousBlockNumber + 1) {
      this.log.warn({
        msg: "New block is not continuous !",
        blockNumber,
        previousBlockNumber,
        lastBlock,
        knownBlock,
      });
    } else {
      this.log.warn({
        msg: "Unexpected block !",
        blockNumber,
        lastBlock,
        knownBlock,
      });
    }
  }

  private async logReorgDelta(lastBlock: ethers.providers.Block) {
    let head = lastBlock;
    const blocks = [lastBlock];

    while (this.blocksByHashMap[head.parentHash] === undefined) {
      head = await this.provider.getBlock(head.parentHash);
      this.blocksByHashMap[head.hash] = head;
      blocks.push(head);
    }

    this.log.warn({
      msg: "Rewritting history after reorg",
      blockNumber: lastBlock.number,
      forkBlockNumber: head.number,
      reorgLength: blocks.length,
      reorgStart: head.number,
      reorgStartHash: head.hash,
      reorgStartOriginalHash: this.blocksMap[head.number].hash,
      reorgEnd: lastBlock.number,
      reorgEndHash: lastBlock.hash,
      reorgEndOriginalHash: this.blocksMap[lastBlock.number].hash,
    });

    blocks.forEach((block) => (this.blocksMap[block.number] = block));
  }
}
