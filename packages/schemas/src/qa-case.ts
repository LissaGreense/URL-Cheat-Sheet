import { z } from 'zod';

export const qaStepSchema = z.strictObject({
  action: z.enum(['navigate', 'click', 'type', 'wait', 'assert']),
  target: z.string().optional(),
  value: z.string().optional(),
  assertion: z.string().optional()
});

export const qaCaseSchema = z.strictObject({
  name: z.string(),
  setup: z.array(z.string()).default([]),
  steps: z.array(qaStepSchema).min(1),
  assertions: z.array(z.string()).min(1),
  dataDependencies: z.array(z.string()).default([])
});

export type QACase = z.infer<typeof qaCaseSchema>;
export type QAStep = z.infer<typeof qaStepSchema>;
