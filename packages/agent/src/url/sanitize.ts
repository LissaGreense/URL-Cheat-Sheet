import {
  vard,
  type Threat as VardThreat,
  type ThreatType as VardThreatType
} from '@andersmyrmel/vard';
import type { ScanResult, Threat } from '@url-cheat-sheet/schemas';

const MAX_SCAN_LENGTH = 1_000_000;

export interface InjectionScanner {
  scan(text: string): ScanResult | Promise<ScanResult>;
}

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

// `maxLength(1_000_000)` is mandatory — vard's default 10_000 would reject
// normal page content on length alone.
const detector = vard.moderate().maxLength(MAX_SCAN_LENGTH);

/**
 * The `Threat` shape deliberately omits vard's `match` and `position`
 * fields — page content may be sensitive and matched fragments must not
 * leak into logs or responses.
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
