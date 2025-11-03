import { z } from 'zod';

/**
 * Login validator
 * Minimum 3 chars username, minimum 6 chars password per FR-027
 */
export const loginValidator = z.object({
  username: z
    .string()
    .min(3, 'Username must be at least 3 characters')
    .max(50, 'Username must be less than 50 characters'),
  password: z.string().min(6, 'Password must be at least 6 characters'),
});

export type LoginInput = z.infer<typeof loginValidator>;
