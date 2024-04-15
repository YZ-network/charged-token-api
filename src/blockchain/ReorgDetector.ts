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
    this.log = rootLogger.child({ chainId, name: "ReorgDetector" });

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
      blockNumber,
      msg: "New block header",
      blockNumberBeforeDisconnect: this.blockNumberBeforeDisconnect,
    });
    if (this.blockNumberBeforeDisconnect < blockNumber) {
      this.log.info({
        msg: "updating block number before disconnect",
        blockNumberBeforeDisconnect: this.blockNumberBeforeDisconnect,
        blockNumber,
      });
      this.blockNumberBeforeDisconnect = blockNumber;
    }

    try {
      const lastBlock = await this.provider?.getBlock(blockNumber);

      if (lastBlock === undefined) {
        this.log.warn({
          blockNumber,
          msg: "Failed reading new block",
          lastBlock,
        });
        return;
      }

      this.checkBlockNumber(blockNumber, lastBlock);
      await this.addBlockAndDetectReorg(blockNumber, lastBlock);
    } catch (err) {
      this.log.warn({ blockNumber, msg: "Failed reading new block data", err });
    }
  }

  private checkBlockNumber(blockNumber: number, lastBlock: ethers.providers.Block) {
    if (lastBlock.number !== blockNumber) {
      throw new Error("Fetched block number doesn't match header !");
    } else {
      this.log.debug({
        chainId: this.chainId,
        blockNumber,
        msg: "Fetched new block",
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
          blockNumber,
          msg: "Duplicate block notification",
          lastBlock,
          knownBlock,
        });
      } else {
        await this.logReorgDelta(lastBlock);
      }
    } else if (blockNumber !== previousBlockNumber + 1) {
      this.log.warn({
        blockNumber,
        previousBlockNumber,
        msg: "New block is not continuous !",
        lastBlock,
        knownBlock,
      });
    } else {
      this.log.warn({
        blockNumber,
        msg: "Unexpected block !",
        lastBlock,
        knownBlock,
      });
    }
  }

  private async logReorgDelta(lastBlock: ethers.providers.Block) {
    let head = lastBlock;
    const blocks = [head];

    while (this.blocksByHashMap[head.parentHash] === undefined) {
      head = await this.provider.getBlock(head.parentHash);
      this.blocksByHashMap[head.hash] = head;
      blocks.push(head);
    }

    this.log.warn({
      msg: "Rewritting history after reorg",
      blockNumber: lastBlock.number,
      forkBlockNumber: head.number,
      reorgLength: blocks.length + 1,
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
