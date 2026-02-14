import { z } from 'zod';

/**
 * Validator for message filter configuration
 * Ensures that if filterType is set, filterValue must also be set (and vice versa)
 */
export const messageFilterSchema = z
  .object({
    filterType: z.enum(['prefix', 'keyword']).nullable(),
    filterValue: z
      .string()
      .min(1, 'Filter value must be at least 1 character')
      .max(10, 'Filter value must be at most 10 characters')
      .nullable(),
    processFromSelf: z.boolean().optional(),
    processGroups: z.boolean().optional(),
  })
  .refine(
    (data) =>
      (data.filterType === null && data.filterValue === null) ||
      (data.filterType !== null && data.filterValue !== null),
    {
      message: 'filterType and filterValue must both be set or both be null',
      path: ['filterValue'],
    }
  );

export type MessageFilterInput = z.infer<typeof messageFilterSchema>;
