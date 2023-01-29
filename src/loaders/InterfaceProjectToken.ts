import { ethers } from "ethers";
import { contracts } from "../contracts";
import { ChargedTokenModel } from "../models";
import { IInterfaceProjectToken } from "../models/InterfaceProjectToken";
import { AbstractLoader } from "./AbstractLoader";

export class InterfaceProjectToken extends AbstractLoader<IInterfaceProjectToken> {
  constructor(provider: ethers.providers.JsonRpcProvider, address: string) {
    super(provider, address, contracts.LiquidityToken);
  }

  async load() {
    console.log("Reading interface project token @", this.address);

    const ins = this.instance;

    return {
      // ownable
      address: this.address,
      owner: await ins.owner(),
      // other
      liquidityToken: await ins.liquidityToken(),
      projectToken: await ins.projectToken(),
      dateLaunch: (await ins.dateLaunch()).toString(),
      dateEndCliff: (await ins.dateEndCliff()).toString(),
      claimFeesPerThousandForPT: (
        await ins.claimFeesPerThousandForPT()
      ).toString(),
      valueProjectTokenToFullRecharge: {},
    };
  }

  async saveOrUpdate(data: IInterfaceProjectToken) {
    if (!(await ChargedTokenModel.exists({ address: data.address }))) {
      await this.toModel(data).save();
    } else {
      await ChargedTokenModel.updateOne({ address: data.address }, data);
    }
  }

  toModel(data: IInterfaceProjectToken) {
    return (ChargedTokenModel as any).toModel(data);
  }
}
