import { z } from 'zod';

export const threatSchema = z.strictObject({
  type: z.enum([
    'instruction-override',
    'role-manipulation',
    'leak',
    'delimiter',
    'encoding',
    'obfuscation',
    'other'
  ]),
  severity: z.number().min(0).max(1)
});

export const scanResultSchema = z.strictObject({
  safe: z.boolean(),
  threats: z.array(threatSchema).readonly()
});

export const documentSchema = z.strictObject({
  text: z.string(),
  title: z.string(),
  sourceUrl: z.string().url()
});

export const extractRequestSchema = z.strictObject({
  url: z.string().url()
});

export const extractResponseSchema = documentSchema.extend({
  byteSize: z.number().int().nonnegative(),
  scan: scanResultSchema
});

export const extractErrorKindSchema = z.enum([
  'FETCH_TIMEOUT',
  'FETCH_TOO_LARGE',
  'FETCH_BLOCKED_URL',
  'FETCH_UNSUPPORTED_CONTENT_TYPE',
  'FETCH_HTTP_ERROR',
  'FETCH_NETWORK',
  'EMPTY_EXTRACTION',
  'PARSE_FAILED'
]);

export const extractErrorSchema = z.strictObject({
  kind: extractErrorKindSchema,
  message: z.string()
});

export type Threat = z.infer<typeof threatSchema>;
export type ScanResult = z.infer<typeof scanResultSchema>;
export type Document = z.infer<typeof documentSchema>;
export type ExtractRequest = z.infer<typeof extractRequestSchema>;
export type ExtractResponse = z.infer<typeof extractResponseSchema>;
export type ExtractErrorKind = z.infer<typeof extractErrorKindSchema>;
export type ExtractError = z.infer<typeof extractErrorSchema>;
