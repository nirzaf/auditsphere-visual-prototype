import type { FindingItem } from '../types';

const resolvedFindingDispositions: FindingItem['disposition'][] = [
  'Corrected in TB',
  'Corrected by client',
  'Waived as immaterial',
  'Uncorrected waived'
];

export const isReleaseBlockingFinding = (finding: FindingItem): boolean =>
  !resolvedFindingDispositions.includes(finding.disposition) &&
  (finding.severity === 'Material' || finding.severity === 'Significant');
