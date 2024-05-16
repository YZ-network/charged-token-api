import type { AbstractBlockchainRepository } from "../AbstractBlockchainRepository";
import type { AbstractHandler } from "../AbstractHandler";
import { ChargedToken } from "./ChargedToken";
import { DelegableToLT } from "./DelegableToLT";
import { Directory } from "./Directory";
import { InterfaceProjectToken } from "./InterfaceProjectToken";

export const handlerFactory = function (
  dataType: DataType,
  chainId: number,
  address: string,
  blockchain: AbstractBlockchainRepository,
): AbstractHandler<any> {
  switch (dataType) {
    case "Directory":
      return new Directory(chainId, blockchain, address, handlerFactory);
    case "ChargedToken":
      return new ChargedToken(chainId, blockchain, address, handlerFactory);
    case "InterfaceProjectToken":
      return new InterfaceProjectToken(chainId, blockchain, address, handlerFactory);
    case "DelegableToLT":
      return new DelegableToLT(chainId, blockchain, address, handlerFactory);
    default:
      throw new Error("Unknown loader type !");
  }
};
