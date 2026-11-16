import { zValidator } from '@hono/zod-validator';
import type { ValidationTargets } from 'hono';
import type { ZodType } from 'zod';

// Doğrulama hatalarını istemcinin gösterebileceği tek bir mesaja çevirir
export const v = <T extends ZodType, Target extends keyof ValidationTargets>(target: Target, schema: T) =>
  zValidator(target, schema, (result, c) => {
    if (!result.success) {
      const issue = result.error.issues[0];
      return c.json({ error: `Geçersiz alan: ${issue?.path.join('.') || target}` }, 400);
    }
  });
