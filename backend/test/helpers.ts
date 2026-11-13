import assert from 'node:assert/strict';
import request from 'supertest';
import type { Express } from 'express';
import { prisma } from '../src/lib/prisma';

/** Kosongkan semua tabel aplikasi (database khusus tes). */
export async function resetDb() {
  const tables = await prisma.$queryRaw<{ t: string }[]>`
    SELECT table_name AS t FROM information_schema.tables
    WHERE table_schema = DATABASE() AND table_name <> '_prisma_migrations'`;
  await prisma.$executeRawUnsafe('SET FOREIGN_KEY_CHECKS=0');
  for (const { t } of tables) await prisma.$executeRawUnsafe(`TRUNCATE TABLE \`${t}\``);
  await prisma.$executeRawUnsafe('SET FOREIGN_KEY_CHECKS=1');
}

export async function login(app: Express, email: string, password: string) {
  const agent = request.agent(app);
  const r = await agent.post('/api/auth/login').send({ email, password });
  assert.equal(r.status, 200, JSON.stringify(r.body));
  return agent;
}
