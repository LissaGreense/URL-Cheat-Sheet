import {
  vard,
  type Threat as VardThreat,
  type ThreatType as VardThreatType
} from '@andersmyrmel/vard';
import type { ScanResult, Threat } from '@url-cheat-sheet/schemas';

const MAX_SCAN_LENGTH = 1_000_000;

/**
 * Scanner abstraction over prompt-injection detection. The interface stays
 * narrow so the underlying engine (currently `@andersmyrmel/vard`) can be
 * swapped without rippling into call sites.
 */
export interface InjectionScanner {
  scan(text: string): ScanResult | Promise<ScanResult>;
}

/**
 * Vard `ThreatType` → schema `Threat['type']` mapping. Insulates our schema
 * vocabulary from vard's internal category names so a future vard rename or
 * engine swap never reaches the schema package.
 *
 * Vard's enum (1.2.0): instructionOverride | roleManipulation |
 * delimiterInjection | systemPromptLeak | encoding.
 */
const CATEGORY_MAP: Record<VardThreatType, Threat['type']> = {
  instructionOverride: 'instruction-override',
  roleManipulation: 'role-manipulation',
  systemPromptLeak: 'leak',
  delimiterInjection: 'delimiter',
  encoding: 'encoding'
};

function mapCategory(category: VardThreatType): Threat['type'] {
  return CATEGORY_MAP[category] ?? 'other';
}

/**
 * Configured vard detector. `moderate()` is the threshold-0.7 preset (balanced
 * security vs false-positive rate). `maxLength(1_000_000)` is mandatory —
 * vard's default of 10_000 would reject normal page content on length alone.
 */
const detector = vard.moderate().maxLength(MAX_SCAN_LENGTH);

/**
 * Prompt-injection scanner backed by `@andersmyrmel/vard@1.2.0`.
 *
 * The `Threat` shape deliberately omits any matched-substring field (vard
 * exposes `match` and `position`, we don't propagate them). Page content may
 * be sensitive; matched fragments must not leak into logs or responses.
 */
export const vardScanner: InjectionScanner = {
  async scan(text: string): Promise<ScanResult> {
    const result = detector.safeParse(text);
    const rawThreats: VardThreat[] = result.safe ? [] : result.threats;
    const threats: Threat[] = rawThreats.map((t) => ({
      type: mapCategory(t.type),
      severity: t.severity
    }));
    return {
      safe: threats.length === 0,
      threats
    };
  }
};
