import { ethers } from "ethers";
import { HydratedDocument } from "mongoose";
import { contracts } from "../contracts";
import { ChargedTokenModel, IChargedToken } from "../models";
import { AbstractLoader } from "./AbstractLoader";

export class ChargedToken extends AbstractLoader {
  constructor(provider: ethers.providers.JsonRpcProvider, address: string) {
    super(provider, address, contracts.LiquidityToken);
  }

  async load(): Promise<IChargedToken> {
    console.log("Reading charged token @", this.address);

    const ins = this.instance;

    return {
      // constants
      address: this.address,
      owner: await ins.owner(),
      name: await ins.name(),
      symbol: await ins.symbol(),
      decimals: await ins.decimals(),
      durationCliff: await ins.durationCliff(),
      durationLinearVesting: await ins.durationLinearVesting(),
      fractionInitialUnlockPerThousand:
        await ins.fractionInitialUnlockPerThousand(),
      maxWithdrawFeesPerThousand: await ins.maxWithdrawFeesPerThousandForLT(),
      maxClaimFeesPerThousand: await ins.maxClaimFeesPerThousandForPT(),
      // variables
      disabled: await ins.areUserFunctionsDisabled(),
      totalSupply: await ins.totalSupply(),
      totalLocked: await ins.balanceOf(this.address),
      totalTokenAllocated: await ins.totalTokenAllocated(),
      stakedLT: await ins.stakedLT(),
      withdrawFeesPerThousandForLT: await ins.withdrawFeesPerThousandForLT(),
      interfaceAddress: await ins.interfaceProjectToken(),
    };
  }

  async saveOrUpdate(data: IChargedToken): Promise<void> {
    if (!(await ChargedTokenModel.exists({ address: data.address }))) {
      await this.toModel(data).save();
    } else {
      await ChargedTokenModel.updateOne({ address: data.address }, data);
    }
  }

  toModel(data: IChargedToken): HydratedDocument<IChargedToken> {
    return (ChargedTokenModel as any).toModel(data);
  }
}
