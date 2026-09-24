import { ConsolidationGroupRecord, PrototypeState } from '../types';

export function consolidationOutputFingerprint(group: ConsolidationGroupRecord, state: PrototypeState): string {
  return JSON.stringify({
    group: [group.id, group.period, group.reportingBasis, group.presentationCurrency || group.currency, group.perimeterRevision || 1],
    components: group.components.map(component => {
      const source = state.engagements.find(item => item.id === component.componentId);
      return [component.componentId, component.role, component.ownershipPercent, component.status, component.packageReview, component.packageRevisionPinned, source?.sourceVersion, component.packageRows];
    }),
    rates: group.components.map(component => [component.currency, component.currency === (group.presentationCurrency || group.currency) ? 1 : group.fxRates[component.currency], group.fxRateHistory?.[component.currency]?.length || 0]),
    eliminations: group.eliminations.filter(item => item.status === 'Approved').map(item => [item.id, item.revision || 1, item.amount, item.lines, item.approvedPerimeterRevision, item.approvedComponentPins, item.approvedFxRates, item.approvalEvidenceRef])
  });
}
