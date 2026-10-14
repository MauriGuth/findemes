import { type User } from '@findemes/shared';

import { type User as UserRow } from '../generated/prisma/client.js';

export function toUserDto(
  row: Pick<
    UserRow,
    'id' | 'email' | 'name' | 'dailyReminderTime' | 'payday' | 'pushAlerts' | 'createdAt'
  >,
): User {
  return {
    id: row.id,
    email: row.email,
    name: row.name,
    dailyReminderTime: row.dailyReminderTime,
    payday: row.payday,
    pushAlerts: row.pushAlerts,
    createdAt: row.createdAt.toISOString(),
  };
}
