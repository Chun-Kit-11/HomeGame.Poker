import { PrismaClient } from '@prisma/client';

let client: PrismaClient | null = null;

/** Lazily-created singleton Prisma client. */
export function db(): PrismaClient {
  if (!client) client = new PrismaClient();
  return client;
}
