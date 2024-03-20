export function makeModelMock() {
  const modelMock = jest.fn();

  (modelMock as any).create = jest.fn();
  (modelMock as any).save = jest.fn();
  (modelMock as any).find = jest.fn();
  (modelMock as any).findOne = jest.fn();
  (modelMock as any).exists = jest.fn();
  (modelMock as any).count = jest.fn();
  (modelMock as any).updateOne = jest.fn();
  (modelMock as any).updateMany = jest.fn();
  (modelMock as any).deleteOne = jest.fn();
  (modelMock as any).deleteMany = jest.fn();
  (modelMock as any).toJSON = jest.fn();

  modelMock.mockImplementation(() => modelMock);

  return modelMock;
}
