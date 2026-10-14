import { type PrismaService } from '../prisma/prisma.service.js';

/** The user's payday (1..28): their month runs from payday to payday (Phase 5). */
export async function loadPayday(prisma: PrismaService, userId: string): Promise<number> {
  const user = await prisma.user.findUnique({ where: { id: userId }, select: { payday: true } });
  return user?.payday ?? 1;
}
