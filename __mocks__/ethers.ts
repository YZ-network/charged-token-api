export { BigNumber } from "ethers";

const Contract = jest.fn().mockImplementation(() => {
  return {
    owner: jest.fn(),
    countWhitelistedProjectOwners: jest.fn(),
    countLTContracts: jest.fn(),
    areUserFunctionsDisabled: jest.fn(),
  };
});

const Interface = jest.fn().mockImplementation(() => {
  return {};
});

const JsonRpcProvider = jest.fn().mockImplementation(() => {
  return {
    getBlockNumber: jest.fn(),
  };
});

export const ethers = {
  Contract,
  utils: {
    Interface,
  },
  providers: {
    JsonRpcProvider,
  },
};

export default ethers;
