export function seedPackageDefinition(engagement: any, mappingRevision = 1) {
  const artifacts = [
    ['XLSX', 'test.xlsx', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'],
    ['DOCX', 'test.docx', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'],
    ['PDF', 'test.pdf', 'application/pdf']
  ].map(([kind, name, mimeType]) => ({ id: `${engagement.id}-${kind}`, kind, name, mimeType, size: 1, sha256: 'a'.repeat(64) }));
  engagement.packageHistory = [{
    id: `${engagement.id}-PKG-${engagement.packageRevision}`,
    engagementId: engagement.id,
    revision: engagement.packageRevision,
    generation: engagement.generation,
    sourceVersion: engagement.sourceVersion,
    mappingRevision,
    notes: 'Test package',
    noteRevision: engagement.packageRevision,
    sections: [{ id: 'rpt', title: 'Report', desc: 'Test', enabled: true, order: 1 }],
    validation: { passed: true, trialBalanceNet: 0, pendingWorkpapers: 0, openReviews: 0, materialFindings: 0 },
    artifacts,
    createdAt: '2026-09-23T00:00:00Z',
    createdBy: engagement.manager,
    createdByUserId: 'manager'
  }];
}

export function seedManagementAcknowledgement(engagement: any) {
  const pkg = engagement.packageHistory.find((item: any) => item.revision === engagement.packageRevision);
  engagement.managementPresentation = { generation: engagement.generation, sourceVersion: engagement.sourceVersion, packageRevision: engagement.packageRevision, presentedAt: '2026-09-23T00:00:00Z', presentedBy: 'Layla Rahman', presentedByUserId: 'manager', preparedByUserId: pkg.createdByUserId, artifacts: structuredClone(pkg.artifacts) };
  engagement.managementPackageDecision = { decision: 'Acknowledged', by: 'Omar Nasser', byUserId: 'client', at: '2026-09-23T00:01:00Z', generation: engagement.generation, sourceVersion: engagement.sourceVersion, packageRevision: engagement.packageRevision, rationale: 'Reviewed current package.', evidenceRef: 'MIN-TEST-01' };
}
