import { ObjectId } from 'mongodb';

export function isValidObjectId(id: string): boolean {
  return typeof id === 'string' && ObjectId.isValid(id) && new ObjectId(id).toHexString() === id.toLowerCase();
}
