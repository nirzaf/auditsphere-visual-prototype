// Module 25: Financial Packages Assembly & DOCX Export (VP-042)
// Package assembly, section selection and ordering, multi-revision lineage,
// interactive validation summary, and genuine Word / PDF deliverable exports.

import React, { useState } from 'react';
import { RouteKey } from '../../types';
import { prototypeStore } from '../../store/prototypeStore';
import { Icon } from '../common/Icons';
import { exportService } from '../../services/exportService';

interface FinancialPackagesViewProps {
  onNavigate: (route: RouteKey) => void;
}

export const FinancialPackagesView: React.FC<FinancialPackagesViewProps> = ({ onNavigate }) => {
  const state = prototypeStore.getSnapshot();
  const selectedEng = state.engagements.find(e => e.id === state.selectedEngagement) || state.engagements[0];
  const client = state.clients.find(c => c.id === selectedEng?.client);

  const [notice, setNotice] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const [packageNotes, setPackageNotes] = useState('Standard statutory disclosures and IFRS accounting policies included.');

  const [sections, setSections] = useState([
    { id: 'rpt', title: 'Independent Auditor Report', desc: 'Standard unmodified opinion under ISA 700 with key audit matters.', enabled: true },
    { id: 'bs', title: 'Statement of Financial Position', desc: 'Comparative balance sheet verified to underlying trial balance.', enabled: true },
    { id: 'pnl', title: 'Statement of Comprehensive Income', desc: 'Operating results, gross margin, and tax provisions.', enabled: true },
    { id: 'eq', title: 'Statement of Changes in Equity', desc: 'Share capital, statutory reserves, and retained earnings.', enabled: true },
    { id: 'cf', title: 'Statement of Cash Flows', desc: 'Operating, investing, and financing cash reconciliation.', enabled: true },
    { id: 'notes', title: 'Statutory Notes & Disclosures', desc: 'Summary of significant IFRS accounting policies and risk disclosures.', enabled: true }
  ]);

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
  const tbSum = selectedEng.rows.reduce((sum, r) => sum + r.balance, 0);
  const tbBalanced = Math.abs(tbSum) < 1;
  const workpapersCleared = selectedEng.workpapers.every(w => !w.applicable || w.status === 'Cleared' || w.status === 'Not applicable');
  const reviewNotesCleared = selectedEng.reviews.every(r => r.status === 'Cleared');
  const findingsImmaterial = state.findings.filter(
    f => f.engagementId === selectedEng.id && f.severity === 'Material' && !['Corrected in TB', 'Corrected by client', 'Waived as immaterial'].includes(f.disposition)
  ).length === 0;

  const allValid = tbBalanced && workpapersCleared && reviewNotesCleared && findingsImmaterial;

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

  const handleAssembleNewRevision = () => {
    try {
      prototypeStore.updatePackageRevision(selectedEng.id);
      triggerNotice('success', `Financial Package Revision ${selectedEng.packageRevision} assembled successfully.`);
    } catch (err: any) {
      triggerNotice('error', err.message);
    }
  };

  const handleExportDOCX = async () => {
    const included = sections.filter(s => s.enabled);
    await exportService.exportDOCX(
      `Financial_Report_Package_${client?.code || 'CL001'}_v${selectedEng.packageRevision}`,
      `Financial Reporting Package - ${client?.name || 'Example Trading Entity'}`,
      [
        `Client Legal Name: ${client?.name || 'Example Trading Entity'}`,
        `Reporting Period: ${selectedEng.period}`,
        `Engagement Service: ${selectedEng.service}`,
        `Audit Signatory: ${selectedEng.partner} (Partner)`,
        `Quality Reviewer: ${selectedEng.eqrRequired ? 'Dr. Tariq Al-Sayed (EQR)' : 'N/A (EQR not required)'}`,
        `Package Revision: Version ${selectedEng.packageRevision}`,
        `Auditor Opinion: ${selectedEng.opinion}`,
        '',
        'TABLE OF CONTENTS (ORDERED SECTIONS):',
        ...included.map((s, idx) => `${idx + 1}. ${s.title} — ${s.desc}`),
        '',
        `Disclosures & Management Notes: ${packageNotes}`
      ]
    );
    triggerNotice('success', `Exported Word (DOCX) package for Rev ${selectedEng.packageRevision}.`);
  };

  const handleExportPDF = () => {
    const included = sections.filter(s => s.enabled);
    exportService.exportPDF(
      `Financial_Report_Package_${client?.code || 'CL001'}_v${selectedEng.packageRevision}`,
      `Financial Reporting Package - ${client?.name || 'Example Trading Entity'}`,
      [
        `Client Legal Name: ${client?.name || 'Example Trading Entity'}`,
        `Period: ${selectedEng.period}`,
        `Package Version: v${selectedEng.packageRevision}`,
        `Audit Opinion: ${selectedEng.opinion}`,
        ...included.map((s, idx) => `Section ${idx + 1}: ${s.title}`),
        `Notes Summary: ${packageNotes}`
      ]
    );
    triggerNotice('success', `Exported PDF package for Rev ${selectedEng.packageRevision}.`);
  };

  return (
    <div className="stack" style={{ gap: 20 }}>
      <div className="pagehead">
        <div>
          <h1>Financial Reporting Packages</h1>
          <p>Interactive section ordering, multi-revision assembly, validation summary, and Word / PDF exports.</p>
        </div>
        <div className="row" style={{ gap: 10 }}>
          <button className="btn sm ghost" onClick={handleExportPDF}>
            <Icon name="download" /> Export PDF Package
          </button>
          <button className="btn primary sm" onClick={handleExportDOCX}>
            <Icon name="download" /> Export Word (DOCX) Package
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
            <p className="sub">Built from Source Version {selectedEng.sourceVersion} · Generation {selectedEng.generation}</p>
          </div>
          <button className="btn sm" onClick={handleAssembleNewRevision}>
            + Assemble New Revision (Rev {selectedEng.packageRevision + 1})
          </button>
        </div>

        <div className="info-grid mt16">
          <div><label>Engagement Service</label><span>{selectedEng.service}</span></div>
          <div><label>Period Under Audit</label><span>{selectedEng.period}</span></div>
          <div><label>Lead Signing Partner</label><span>{selectedEng.partner}</span></div>
          <div><label>Auditor Opinion Proposed</label><b>{selectedEng.opinion}</b></div>
        </div>
      </div>

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
