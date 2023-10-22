function makeModel() {
  return {
    create: jest.fn(),
    find: jest.fn(),
    findOne: jest.fn(),
    exists: jest.fn(),
    updateOne: jest.fn(),
    deleteMany: jest.fn(),
    toModel: jest.fn(),
    toGraphQL: jest.fn(),
  };
}

export const ChargedTokenModel = makeModel();
export const DirectoryModel = makeModel();
export const InterfaceProjectTokenModel = makeModel();
export const DelegableToLTModel = makeModel();
export const EventModel = makeModel();
export const UserBalanceModel = makeModel();
