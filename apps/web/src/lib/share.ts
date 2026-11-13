import LZString from 'lz-string';
import type { RunReport } from '@airbag/core';

export function encodeReport(report: RunReport): string {
  const slim: RunReport = {
    ...report,
    laws: report.laws.map((law) => ({
      ...law,
      scenarios: law.scenarios.map((scenario) => ({
        ...scenario,
        events: [],
        violations: scenario.violations.map((violation) => ({ ...violation, evidence: [] })),
      })),
    })),
  };
  return LZString.compressToEncodedURIComponent(JSON.stringify(slim));
}

export function decodeReport(encoded: string): RunReport | null {
  try {
    const text = LZString.decompressFromEncodedURIComponent(encoded);
    if (!text) return null;
    const parsed = JSON.parse(text) as RunReport;
    if (!parsed || parsed.schemaVersion !== 1 || !parsed.overall || !Array.isArray(parsed.laws)) {
      return null;
    }
    return parsed;
  } catch {
    return null;
  }
}
