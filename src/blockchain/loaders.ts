import type { ethers } from "ethers";
import { EMPTY_ADDRESS } from "../vendor";

async function loadDirectory(
  chainId: number,
  ins: ethers.Contract,
  address: string,
  blockNumber: number,
): Promise<IDirectory> {
  const whitelistCount = (await ins.countWhitelistedProjectOwners()).toNumber();
  const whitelistedProjectOwners: string[] = [];
  const projects: string[] = [];
  const whitelist: Record<string, string> = {};

  for (let i = 0; i < whitelistCount; i++) {
    const projectOwner = await ins.getWhitelistedProjectOwner(i);
    const projectName = await ins.getWhitelistedProjectName(i);
    whitelistedProjectOwners.push(projectOwner);
    projects.push(projectName);
    whitelist[projectOwner] = await ins.whitelist(projectOwner);
  }

  const contractsCount = (await ins.countLTContracts()).toNumber();
  const directory: string[] = [];
  const projectRelatedToLT: Record<string, string> = {};

  for (let i = 0; i < contractsCount; i++) {
    const ctAddress = await ins.getLTContract(i);
    directory.push(ctAddress);
    projectRelatedToLT[ctAddress] = await ins.projectRelatedToLT(ctAddress);
  }

  return {
    chainId,
    lastUpdateBlock: blockNumber,
    address,
    owner: await ins.owner(),
    directory,
    whitelistedProjectOwners,
    projects,
    projectRelatedToLT,
    whitelist,
    areUserFunctionsDisabled: await ins.areUserFunctionsDisabled(),
  };
}

async function loadChargedToken(
  chainId: number,
  ins: ethers.Contract,
  address: string,
  blockNumber: number,
): Promise<IChargedToken> {
  const fundraisingFields = {
    isFundraisingContract: false,
    fundraisingTokenSymbol: "",
    priceTokenPer1e18: "0",
    fundraisingToken: EMPTY_ADDRESS,
    isFundraisingActive: false,
  };

  try {
    fundraisingFields.isFundraisingActive = await ins.isFundraisingActive();
    fundraisingFields.fundraisingTokenSymbol = (await ins.fundraisingTokenSymbol()).toString();
    fundraisingFields.priceTokenPer1e18 = (await ins.priceTokenPer1e18()).toString();
    fundraisingFields.fundraisingToken = (await ins.fundraisingToken()).toString();
    fundraisingFields.isFundraisingContract = true;
  } catch (err) {}

  return {
    // contract
    chainId,
    lastUpdateBlock: blockNumber,
    address,
    // ownable
    owner: await ins.owner(),
    // erc20
    name: await ins.name(),
    symbol: await ins.symbol(),
    decimals: (await ins.decimals()).toString(),
    totalSupply: (await ins.totalSupply()).toString(),
    // constants
    fractionInitialUnlockPerThousand: (await ins.fractionInitialUnlockPerThousand()).toString(),
    durationCliff: (await ins.durationCliff()).toString(),
    durationLinearVesting: (await ins.durationLinearVesting()).toString(),
    maxInitialTokenAllocation: (await ins.maxInitialTokenAllocation()).toString(),
    maxWithdrawFeesPerThousandForLT: (await ins.maxWithdrawFeesPerThousandForLT()).toString(),
    maxClaimFeesPerThousandForPT: (await ins.maxClaimFeesPerThousandForPT()).toString(),
    maxStakingAPR: (await ins.maxStakingAPR()).toString(),
    maxStakingTokenAmount: (await ins.maxStakingTokenAmount()).toString(),
    // toggles
    areUserFunctionsDisabled: await ins.areUserFunctionsDisabled(),
    isInterfaceProjectTokenLocked: await ins.isInterfaceProjectTokenLocked(),
    areAllocationsTerminated: await ins.areAllocationsTerminated(),
    // variables
    interfaceProjectToken: await ins.interfaceProjectToken(),
    ratioFeesToRewardHodlersPerThousand: (await ins.ratioFeesToRewardHodlersPerThousand()).toString(),
    currentRewardPerShare1e18: (await ins.currentRewardPerShare1e18()).toString(),
    stakedLT: (await ins.stakedLT()).toString(),
    totalLocked: (await ins.balanceOf(address)).toString(),
    totalTokenAllocated: (await ins.totalTokenAllocated()).toString(),
    withdrawFeesPerThousandForLT: (await ins.withdrawFeesPerThousandForLT()).toString(),
    // staking
    stakingStartDate: (await ins.stakingStartDate()).toString(),
    stakingDuration: (await ins.stakingDuration()).toString(),
    stakingDateLastCheckpoint: (await ins.stakingDateLastCheckpoint()).toString(),
    campaignStakingRewards: (await ins.campaignStakingRewards()).toString(),
    totalStakingRewards: (await ins.totalStakingRewards()).toString(),
    // fundraising
    ...fundraisingFields,
  };
}

async function loadInterfaceProjectToken(
  chainId: number,
  ins: ethers.Contract,
  address: string,
  blockNumber: number,
): Promise<IInterfaceProjectToken> {
  return {
    // contract
    chainId,
    lastUpdateBlock: blockNumber,
    address,
    // ownable
    owner: await ins.owner(),
    // other
    liquidityToken: await ins.liquidityToken(),
    projectToken: await ins.projectToken(),
    dateLaunch: (await ins.dateLaunch()).toString(),
    dateEndCliff: (await ins.dateEndCliff()).toString(),
    claimFeesPerThousandForPT: (await ins.claimFeesPerThousandForPT()).toString(),
  };
}

async function loadDelegableToLT(
  chainId: number,
  ins: ethers.Contract,
  address: string,
  blockNumber: number,
): Promise<IDelegableToLT> {
  const validatedInterfaceProjectToken: string[] = [];
  const validatedInterfaceCount = (await ins.countValidatedInterfaceProjectToken()).toNumber();
  for (let i = 0; i < validatedInterfaceCount; i++) {
    validatedInterfaceProjectToken.push(await ins.getValidatedInterfaceProjectToken(i));
  }

  return {
    // contract
    chainId,
    lastUpdateBlock: blockNumber,
    address,
    // ownable
    owner: await ins.owner(),
    // erc20
    name: await ins.name(),
    symbol: await ins.symbol(),
    decimals: (await ins.decimals()).toString(),
    totalSupply: (await ins.totalSupply()).toString(),
    // other
    validatedInterfaceProjectToken,
    isListOfInterfaceProjectTokenComplete: await ins.isListOfInterfaceProjectTokenComplete(),
  };
}

export async function loadContract<T extends IContract>(
  chainId: number,
  dataType: DataType,
  instance: ethers.Contract,
  address: string,
  blockNumber: number,
): Promise<T> {
  switch (dataType) {
    case "Directory":
      return (await loadDirectory(chainId, instance, address, blockNumber)) as unknown as T;
    case "ChargedToken":
      return (await loadChargedToken(chainId, instance, address, blockNumber)) as unknown as T;
    case "InterfaceProjectToken":
      return (await loadInterfaceProjectToken(chainId, instance, address, blockNumber)) as unknown as T;
    case "DelegableToLT":
      return (await loadDelegableToLT(chainId, instance, address, blockNumber)) as unknown as T;
    default:
      throw new Error("Unexpected dataType !");
  }
}
