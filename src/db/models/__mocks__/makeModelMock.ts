export function makeModelMock() {
  return {
    create: jest.fn(),
    find: jest.fn(),
    findOne: jest.fn(),
    exists: jest.fn(),
    count: jest.fn(),
    updateOne: jest.fn(),
    updateMany: jest.fn(),
    deleteOne: jest.fn(),
    deleteMany: jest.fn(),
    toJSON: jest.fn(),
  };
}
