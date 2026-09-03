import { ObjectId } from 'mongodb';

/**
 * mongodb's own `ObjectId.isValid()` is a well-known footgun: it accepts any
 * plain 12-character string, not just 12-byte hex. Round-tripping through a
 * real ObjectId and comparing string forms catches that case, so malformed
 * ids reliably surface as BAD_USER_INPUT instead of silently matching (or
 * crashing on) an unrelated document.
 */
export function isValidObjectId(id: string): boolean {
  return typeof id === 'string' && ObjectId.isValid(id) && new ObjectId(id).toHexString() === id.toLowerCase();
}
