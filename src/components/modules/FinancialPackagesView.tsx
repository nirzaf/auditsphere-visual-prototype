// Module 25: Financial Packages Assembly & DOCX Export (VP-042)
// Package assembly, section selection and ordering, multi-revision lineage,
// interactive validation summary, and genuine Word / PDF deliverable exports.

import React, { useState } from 'react';
import { RouteKey } from '../../types';
import { prototypeStore } from '../../store/prototypeStore';
import { Icon } from '../common/Icons';
import { exportService } from '../../services/exportService';
import { applyReportingAdjustments } from '../../services/calculations';
import { artifactSha256, downloadVerifiedArtifact, persistArtifact } from '../../services/artifactStore';
import { FinancialPackageRevision, GeneratedArtifactRecord } from '../../types';

const DEFAULT_SECTIONS = [
  { id: 'rpt', title: 'Independent Auditor Report', desc: 'Standard unmodified opinion under ISA 700 with key audit matters.', enabled: true },
  { id: 'bs', title: 'Statement of Financial Position', desc: 'Comparative balance sheet verified to underlying trial balance.', enabled: true },
  { id: 'pnl', title: 'Statement of Comprehensive Income', desc: 'Operating results, gross margin, and tax provisions.', enabled: true },
  { id: 'eq', title: 'Statement of Changes in Equity', desc: 'Share capital, statutory reserves, and retained earnings.', enabled: true },
  { id: 'cf', title: 'Statement of Cash Flows', desc: 'Operating, investing, and financing cash reconciliation.', enabled: true },
  { id: 'notes', title: 'Statutory Notes & Disclosures', desc: 'Summary of significant IFRS accounting policies and risk disclosures.', enabled: true }
];

interface FinancialPackagesViewProps {
  onNavigate: (route: RouteKey) => void;
}

export const FinancialPackagesView: React.FC<FinancialPackagesViewProps> = ({ onNavigate }) => {
  const state = prototypeStore.getSnapshot();
  const selectedEng = state.engagements.find(e => e.id === state.selectedEngagement) || state.engagements[0];
  const client = state.clients.find(c => c.id === selectedEng?.client);
  const savedPackage = selectedEng?.packageHistory?.find(p => p.revision === selectedEng.packageRevision);

  const [notice, setNotice] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const [packageNotes, setPackageNotes] = useState(savedPackage?.notes || 'Standard statutory disclosures and IFRS accounting policies included.');
  const [sections, setSections] = useState(savedPackage?.sections.slice().sort((a, b) => a.order - b.order).map(({ id, title, desc, enabled }) => ({ id, title, desc, enabled })) || DEFAULT_SECTIONS);
  const [assembling, setAssembling] = useState(false);

  const triggerNotice = (type: 'success' | 'error', text: string) => {
    setNotice({ type, text });
    setTimeout(() => setNotice(null), 6000);
  };

  if (!selectedEng) {
    return (
      <div className="panel panel-pad text-center" style={{ padding: '60px 20px' }}>
        <Icon name="archive" size="xl" className="text-muted mb16" />
        <h3>No Active Engagement Selected</h3>
        <p className="sub max-w-md mx-auto mt8">
          Select or create an engagement to compile and export financial packages.
        </p>
        <button className="btn primary sm mt16" onClick={() => onNavigate('engagements')}>
          Go to Engagements
        </button>
      </div>
    );
  }

  // Pre-release validation summary gates
  const adjustmentResult = applyReportingAdjustments(selectedEng.rows, state.adjustmentJournals.filter(j => j.engagementId === selectedEng.id));
  const packageRows = adjustmentResult.rows;
  const tbSum = packageRows.reduce((sum, r) => sum + r.balance, 0);
  const tbBalanced = Math.abs(tbSum) < 1;
  const workpapersCleared = selectedEng.workpapers.every(w => !w.applicable || w.status === 'Cleared' || w.status === 'Not applicable');
  const reviewNotesCleared = selectedEng.reviews.every(r => r.status === 'Cleared');
  const findingsImmaterial = state.findings.filter(
    f => f.engagementId === selectedEng.id && f.severity === 'Material' && !['Corrected in TB', 'Corrected by client', 'Waived as immaterial'].includes(f.disposition)
  ).length === 0;

  const allValid = tbBalanced && workpapersCleared && reviewNotesCleared && findingsImmaterial && adjustmentResult.unapplied.length === 0;

  const handleMoveUp = (index: number) => {
    if (index === 0) return;
    setSections(prev => {
      const copy = [...prev];
      const temp = copy[index - 1];
      copy[index - 1] = copy[index];
      copy[index] = temp;
      return copy;
    });
  };

  const handleMoveDown = (index: number) => {
    if (index === sections.length - 1) return;
    setSections(prev => {
      const copy = [...prev];
      const temp = copy[index + 1];
      copy[index + 1] = copy[index];
      copy[index] = temp;
      return copy;
    });
  };

  const handleToggleSection = (index: number) => {
    setSections(prev => prev.map((s, i) => i === index ? { ...s, enabled: !s.enabled } : s));
  };

  const packageLines = (revision: number, included: typeof sections) => [
    `Client Legal Name: ${client?.name || 'Example Trading Entity'}`,
    `Reporting Period: ${selectedEng.period}`,
    `Engagement Service: ${selectedEng.service}`,
    `Audit Signatory: ${selectedEng.partner} (Partner)`,
    `Quality Reviewer: ${selectedEng.eqrRequired ? 'Dr. Tariq Al-Sayed (EQR)' : 'N/A (EQR not required)'}`,
    `Package Revision: Version ${revision}`,
    `Source Revision: TB v${selectedEng.sourceVersion}`,
    `Mapping Revision: v${selectedEng.sourceVersion}`,
    `Auditor Opinion: ${selectedEng.opinion}`,
    `Signed trial-balance total: ${tbSum.toFixed(2)} ${selectedEng.currency}`,
    `Total assets: ${packageRows.filter(r => r.type === 'asset').reduce((sum, r) => sum + r.balance, 0).toFixed(2)} ${selectedEng.currency}`,
    `Total liabilities: ${Math.abs(packageRows.filter(r => r.type === 'liability').reduce((sum, r) => sum + r.balance, 0)).toFixed(2)} ${selectedEng.currency}`,
    `Included accepted unreflected adjustments: ${adjustmentResult.applied.join(', ') || 'None'}`,
    '', 'TABLE OF CONTENTS (ORDERED SECTIONS):',
    ...included.map((s, idx) => `${idx + 1}. ${s.title} — ${s.desc}`),
    '', `Disclosures & Management Notes: ${packageNotes}`
  ];

  const handleAssembleNewRevision = async () => {
    setAssembling(true);
    try {
      if (prototypeStore.isSessionOnlyMode()) throw new Error('Browser storage is in session-only mode; package files cannot be committed as a durable revision.');
      const revision = selectedEng.packageRevision + 1;
      const included = sections.filter(s => s.enabled);
      const title = `Financial Reporting Package - ${client?.name || 'Example Trading Entity'} - Rev ${revision}`;
      const lines = packageLines(revision, included);
      const fileBase = `Financial_Report_Package_${client?.code || 'CL001'}_v${revision}`;
      const rows = [
        ['Account code', 'Account name', 'Type', `Signed balance (${selectedEng.currency})`],
        ...packageRows.map(r => [r.code, r.name, r.type, r.balance]),
        ['Total', '', '', tbSum],
        ['Source revision', '', '', selectedEng.sourceVersion],
        ['Mapping revision', '', '', selectedEng.sourceVersion],
        ['Package revision', '', '', revision]
      ];
      const blobs = [
        { kind: 'XLSX' as const, name: `${fileBase}.xlsx`, mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', blob: exportService.createXLSXBlob(title, rows) },
        { kind: 'DOCX' as const, name: `${fileBase}.docx`, mimeType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', blob: await exportService.createDOCXBlob(title, lines) },
        { kind: 'PDF' as const, name: `${fileBase}.pdf`, mimeType: 'application/pdf', blob: exportService.createPDFBlob(title, lines) }
      ];
      const artifacts: GeneratedArtifactRecord[] = [];
      for (const item of blobs) {
        const artifact = { id: `${selectedEng.id}-PKG-${revision}-${item.kind}-${crypto.randomUUID()}`, name: item.name, kind: item.kind, mimeType: item.mimeType, size: item.blob.size, sha256: await artifactSha256(item.blob) };
        await persistArtifact(artifact, item.blob);
        artifacts.push(artifact);
      }
      const record: FinancialPackageRevision = {
        id: `${selectedEng.id}-PKG-${revision}`,
        engagementId: selectedEng.id,
        revision,
        generation: selectedEng.generation + 1,
        sourceVersion: selectedEng.sourceVersion,
        mappingRevision: selectedEng.sourceVersion,
        notes: packageNotes,
        noteRevision: revision,
        sections: sections.map((s, order) => ({ ...s, order: order + 1 })),
        validation: { passed: allValid, trialBalanceNet: tbSum, pendingWorkpapers: selectedEng.workpapers.filter(w => w.applicable && w.status !== 'Cleared' && w.status !== 'Not applicable').length, openReviews: selectedEng.reviews.filter(r => r.status !== 'Cleared').length, materialFindings: state.findings.filter(f => f.engagementId === selectedEng.id && f.severity === 'Material' && !['Corrected in TB', 'Corrected by client', 'Waived as immaterial'].includes(f.disposition)).length },
        artifacts,
        createdAt: new Date().toISOString(),
        createdBy: state.currentPerson,
        createdByUserId: state.currentUserId
      };
      prototypeStore.saveFinancialPackageRevision(record);
      triggerNotice(allValid ? 'success' : 'error', `Package revision ${revision} saved with exact XLSX, DOCX and PDF files${allValid ? '.' : '; validation remains blocked until all package gates are cleared.'}`);
    } catch (err: any) {
      triggerNotice('error', err.message);
    } finally {
      setAssembling(false);
    }
  };

  const handleDownload = async (kind: GeneratedArtifactRecord['kind']) => {
    const revision = selectedEng.packageHistory?.find(p => p.revision === selectedEng.packageRevision);
    const artifact = revision?.artifacts.find(a => a.kind === kind);
    if (!artifact) { triggerNotice('error', 'Assemble this package revision first to create its exact saved outputs.'); return; }
    try { await downloadVerifiedArtifact(artifact); triggerNotice('success', `Downloaded ${artifact.name} after SHA-256 verification.`); }
    catch (err: any) { triggerNotice('error', err.message); }
  };

  return (
    <div className="stack" style={{ gap: 20 }}>
      <div className="pagehead">
        <div>
          <h1>Financial Reporting Packages</h1>
          <p>Exact package revisions with persisted sections, notes, source lineage and generated XLSX, DOCX and PDF files.</p>
        </div>
        <div className="row" style={{ gap: 10 }}>
          <button className="btn sm ghost" disabled={!savedPackage} onClick={() => handleDownload('XLSX')}>
            <Icon name="download" /> Download XLSX
          </button>
          <button className="btn sm ghost" disabled={!savedPackage} onClick={() => handleDownload('PDF')}>
            <Icon name="download" /> Download PDF
          </button>
          <button className="btn primary sm" disabled={!savedPackage} onClick={() => handleDownload('DOCX')}>
            <Icon name="download" /> Download DOCX
          </button>
        </div>
      </div>

      {notice && (
        <div
          className="panel panel-pad"
          style={{
            background: notice.type === 'success' ? '#f0fdf4' : '#fef2f2',
            borderColor: notice.type === 'success' ? '#86efac' : '#fca5a5',
            color: notice.type === 'success' ? '#166534' : '#991b1b',
            padding: '10px 16px'
          }}
        >
          <b>{notice.type === 'success' ? '✓ ' : '⚠ '}</b>
          {notice.text}
        </div>
      )}

      {/* Package Header & Revision Info */}
      <div className="panel panel-pad">
        <div className="between">
          <div>
            <span className="eyebrow">ACTIVE PACKAGE LINEAGE</span>
            <h2>{client?.name} · Rev {selectedEng.packageRevision}</h2>
            <p className="sub">Source v{savedPackage?.sourceVersion ?? 'not assembled'} · Mapping v{savedPackage?.mappingRevision ?? 'not assembled'} · Generation {selectedEng.generation}</p>
          </div>
          <button className="btn sm" disabled={assembling || !['manager', 'preparer'].includes(state.currentRole)} onClick={handleAssembleNewRevision}>
            {assembling ? 'Saving exact artifacts…' : `+ Assemble New Revision (Rev ${selectedEng.packageRevision + 1})`}
          </button>
        </div>

        <div className="info-grid mt16">
          <div><label>Engagement Service</label><span>{selectedEng.service}</span></div>
          <div><label>Period Under Audit</label><span>{selectedEng.period}</span></div>
          <div><label>Lead Signing Partner</label><span>{selectedEng.partner}</span></div>
          <div><label>Auditor Opinion Proposed</label><b>{selectedEng.opinion}</b></div>
        </div>
      </div>

      {savedPackage && (
        <div className="panel panel-pad">
          <h3>Saved Revision {savedPackage.revision} · {savedPackage.validation.passed ? 'Validated' : 'Validation blocked'}</h3>
          <p className="sub mt4">Notes revision {savedPackage.noteRevision} · assembled by {savedPackage.createdBy} · {new Date(savedPackage.createdAt).toLocaleString('en-GB')}</p>
          {savedPackage.sourceVersion !== selectedEng.sourceVersion && <p role="status" className="mt8">This package is pinned to TB source v{savedPackage.sourceVersion}; current source is v{selectedEng.sourceVersion}. Assemble a new revision before release.</p>}
          <div className="tablewrap mt8"><table>
            <thead><tr><th>Artifact</th><th>Exact identity</th><th>Type / bytes</th><th>SHA-256</th></tr></thead>
            <tbody>{savedPackage.artifacts.map(artifact => <tr key={artifact.id}>
              <td>{artifact.name}</td><td className="mono">{artifact.id}</td><td>{artifact.kind} · {artifact.size}</td><td className="mono">{artifact.sha256}</td>
            </tr>)}</tbody>
          </table></div>
        </div>
      )}

      {/* Validation Summary Panel */}
      <div className="panel panel-pad">
        <div className="between">
          <div>
            <h3>Pre-Publication Validation Summary</h3>
            <p className="sub">Comprehensive integrity gates required before deliverable freezing and client release.</p>
          </div>
          <span className={`badge ${allValid ? 'green' : 'amber'}`}>
            {allValid ? 'All Gates Cleared' : 'Action Required'}
          </span>
        </div>

        <div className="grid4 mt16" style={{ gap: 12 }}>
          <div className="borderbox" style={{ padding: 12 }}>
            <span className="caption">Trial Balance Net Zero</span>
            <div className="mt4">
              <span className={`badge ${tbBalanced ? 'green' : 'red'}`}>
                {tbBalanced ? 'Balanced (Net 0)' : `Unbalanced (${tbSum})`}
              </span>
            </div>
          </div>

          <div className="borderbox" style={{ padding: 12 }}>
            <span className="caption">Accepted Adjustments</span>
            <div className="mt4"><span className={`badge ${adjustmentResult.unapplied.length ? 'red' : 'green'}`}>
              {adjustmentResult.unapplied.length ? `${adjustmentResult.unapplied.length} require resolution` : `${adjustmentResult.applied.length} included once`}
            </span></div>
            {adjustmentResult.unapplied.map(item => <div className="caption mt4" key={item.journalId}>{item.journalId}: {item.reason}</div>)}
          </div>

          <div className="borderbox" style={{ padding: 12 }}>
            <span className="caption">Working Papers Clearance</span>
            <div className="mt4">
              <span className={`badge ${workpapersCleared ? 'green' : 'amber'}`}>
                {workpapersCleared ? 'All WPs Cleared' : 'Pending WPs'}
              </span>
            </div>
          </div>

          <div className="borderbox" style={{ padding: 12 }}>
            <span className="caption">Review Notes Clearance</span>
            <div className="mt4">
              <span className={`badge ${reviewNotesCleared ? 'green' : 'amber'}`}>
                {reviewNotesCleared ? 'Zero Open Notes' : 'Pending Notes'}
              </span>
            </div>
          </div>

          <div className="borderbox" style={{ padding: 12 }}>
            <span className="caption">Material Findings</span>
            <div className="mt4">
              <span className={`badge ${findingsImmaterial ? 'green' : 'red'}`}>
                {findingsImmaterial ? 'Immaterial / Cleared' : 'Uncorrected Found'}
              </span>
            </div>
          </div>
        </div>
      </div>

      {/* Interactive Contents Selection & Ordering */}
      <div className="panel">
        <div className="panel-head between">
          <div>
            <h3>Interactive Package Section Selection &amp; Ordering</h3>
            <span className="caption">Toggle sections and reorder sections for export package generation</span>
          </div>
          <span className="caption">{sections.filter(s => s.enabled).length} of {sections.length} active</span>
        </div>

        <div className="tablewrap">
          <table>
            <thead>
              <tr>
                <th style={{ width: 60 }}>Include</th>
                <th style={{ width: 60 }}>Order</th>
                <th>Section Title</th>
                <th>Description</th>
                <th>Order Controls</th>
              </tr>
            </thead>
            <tbody>
              {sections.map((sec, idx) => (
                <tr key={sec.id} style={{ opacity: sec.enabled ? 1 : 0.5 }}>
                  <td>
                    <input
                      type="checkbox"
                      checked={sec.enabled}
                      onChange={() => handleToggleSection(idx)}
                    />
                  </td>
                  <td><b>#{idx + 1}</b></td>
                  <td><b>{sec.title}</b></td>
                  <td><span className="cell-sub">{sec.desc}</span></td>
                  <td>
                    <div className="row" style={{ gap: 4 }}>
                      <button
                        className="btn sm ghost"
                        disabled={idx === 0}
                        onClick={() => handleMoveUp(idx)}
                      >
                        ▲ Up
                      </button>
                      <button
                        className="btn sm ghost"
                        disabled={idx === sections.length - 1}
                        onClick={() => handleMoveDown(idx)}
                      >
                        ▼ Down
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div className="panel-pad">
          <label className="caption">Disclosures &amp; Management Representation Notes</label>
          <textarea
            className="input mt4"
            rows={2}
            value={packageNotes}
            onChange={e => setPackageNotes(e.target.value)}
          />
        </div>
      </div>
    </div>
  );
};
