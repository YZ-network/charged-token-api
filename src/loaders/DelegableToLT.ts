import { ethers } from "ethers";
import { contracts } from "../contracts";
import { DelegableToLTModel, IDelegableToLT } from "../models/DelegableToLT";
import { AbstractLoader } from "./AbstractLoader";

export class DelegableToLT extends AbstractLoader<IDelegableToLT> {
  constructor(provider: ethers.providers.JsonRpcProvider, address: string) {
    super(provider, address, contracts.DelegableToLT);
  }

  async init(): Promise<void> {
    const ptData = await this.load();
    await this.saveOrUpdate(ptData);
  }

  async load() {
    console.log("Reading project token @", this.address);

    const ins = this.instance;

    const validatedInterfaceProjectToken: string[] = [];
    const validatedInterfaceCount = (
      await ins.countValidatedInterfaceProjectToken()
    ).toNumber();
    for (let i = 0; i < validatedInterfaceCount; i++) {
      validatedInterfaceProjectToken.push(
        await ins.getValidatedInterfaceProjectToken(i)
      );
    }

    return {
      // ownable
      address: this.address,
      owner: await ins.owner(),
      // erc20
      name: await ins.name(),
      symbol: await ins.symbol(),
      decimals: (await ins.decimals()).toString(),
      balances: {},
      totalSupply: await ins.totalSupply(),
      // other
      validatedInterfaceProjectToken,
      isListOfInterfaceProjectTokenComplete:
        await ins.isListOfInterfaceProjectTokenComplete(),
    };
  }

  async saveOrUpdate(data: IDelegableToLT) {
    if (!(await DelegableToLTModel.exists({ address: data.address }))) {
      await this.toModel(data).save();
    } else {
      await DelegableToLTModel.updateOne({ address: data.address }, data);
    }
  }

  subscribeToEvents(): void {
    // ERC20 events
    // event Transfer(address indexed from, address indexed to, uint256 value);
    this.instance.on("Transfer", (event) => {
      console.log("received Transfer event :", event);
    });

    // self events
    /*
      event LTAllocatedByOwner(address _user, uint _value, uint _hodlRewards, bool _isAllocationStaked);

  event LTAllocatedThroughSale(address _user, uint _valueLT, uint _valuePayment, uint _hodlRewards);

  event LTReceived(address _user, uint _value, uint _totalFees, uint _feesToRewardHodlers, uint _hodlRewards);

  event LTDeposited(address _user, uint _value, uint _hodlRewards);
*/
  }

  toModel(data: IDelegableToLT) {
    return (DelegableToLTModel as any).toModel(data);
  }
}
