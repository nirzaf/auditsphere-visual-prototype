// Module 25: Financial Packages Assembly & DOCX Export (VP-042)
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

  const [packageNotes, setPackageNotes] = useState('Standard statutory disclosures and IFRS accounting policies included.');

  const handleExportDOCX = async () => {
    await exportService.exportDOCX(
      `Financial_Report_Package_${client?.code || 'CL001'}_v${selectedEng.packageRevision}`,
      `Financial Reporting Package - ${client?.name || 'Example Trading Entity'}`,
      [
        `Client Legal Name: ${client?.name || 'Example Trading Entity'}`,
        `Reporting Period: ${selectedEng.period}`,
        `Engagement Service: ${selectedEng.service}`,
        `Audit Signatory: ${selectedEng.partner} (Partner)`,
        `Quality Reviewer: ${selectedEng.eqrRequired ? 'Fatima Al-Kuwari (EQR)' : 'N/A'}`,
        `Package Revision: Version ${selectedEng.packageRevision}`,
        `Auditor Opinion: ${selectedEng.opinion}`,
        '',
        'TABLE OF CONTENTS:',
        '1. Independent Auditor Report to the Shareholders',
        '2. Statement of Financial Position (Balance Sheet)',
        '3. Statement of Comprehensive Income (P&L)',
        '4. Statement of Changes in Equity',
        '5. Statement of Cash Flows',
        '6. Significant Accounting Policies and Notes to the Financial Statements',
        '',
        `Disclosures & Management Notes: ${packageNotes}`
      ]
    );
  };

  const handleExportPDF = () => {
    exportService.exportPDF(
      `Financial_Report_Package_${client?.code || 'CL001'}_v${selectedEng.packageRevision}`,
      `Financial Reporting Package - ${client?.name || 'Example Trading Entity'}`,
      [
        `Client Legal Name: ${client?.name || 'Example Trading Entity'}`,
        `Period: ${selectedEng.period}`,
        `Package Version: v${selectedEng.packageRevision}`,
        `Audit Opinion: ${selectedEng.opinion}`,
        'Section 1: Independent Auditor Report',
        'Section 2: Audited Financial Statements',
        'Section 3: Mandatory Accounting Notes & Disclosures',
        `Notes Summary: ${packageNotes}`
      ]
    );
  };

  return (
    <div className="stack" style={{ gap: 20 }}>
      <div className="pagehead">
        <div>
          <h1>Financial Reporting Packages</h1>
          <p>Package assembly, version lineage, note disclosures, and genuine Word / PDF deliverable exports.</p>
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

      <div className="panel panel-pad">
        <div className="between">
          <div>
            <span className="eyebrow">ACTIVE PACKAGE LINEAGE</span>
            <h2>{client?.name} · Rev {selectedEng.packageRevision}</h2>
            <p className="sub">Built from Source Version {selectedEng.sourceVersion} · Generation {selectedEng.generation}</p>
          </div>
          <span className="badge green">Current Live Package</span>
        </div>

        <div className="info-grid mt16">
          <div><label>Engagement Service</label><span>{selectedEng.service}</span></div>
          <div><label>Period Under Audit</label><span>{selectedEng.period}</span></div>
          <div><label>Lead Signing Partner</label><span>{selectedEng.partner}</span></div>
          <div><label>Auditor Opinion Proposed</label><b>{selectedEng.opinion}</b></div>
        </div>

        <div className="divider" />

        <h4>Assembled Package Components</h4>
        <div className="stack mt12" style={{ gap: 8 }}>
          {[
            { title: 'Independent Auditor Report', desc: 'Standard unmodified opinion under ISA 700 with key audit matters.', status: 'Complete' },
            { title: 'Statement of Financial Position', desc: 'Comparative balance sheet verified to underlying trial balance.', status: 'Complete' },
            { title: 'Statement of Comprehensive Income', desc: 'Operating results, gross margin, and tax provisions.', status: 'Complete' },
            { title: 'Statement of Changes in Equity', desc: 'Share capital, statutory reserves, and retained earnings.', status: 'Complete' },
            { title: 'Statement of Cash Flows', desc: 'Operating, investing, and financing cash reconciliation.', status: 'Complete' },
            { title: 'Statutory Notes and Accounting Policies', desc: 'Summary of significant IFRS accounting policies and risk disclosures.', status: 'Draft' }
          ].map((item, idx) => (
            <div key={idx} className="between borderbox" style={{ padding: 12 }}>
              <div>
                <b>{idx + 1}. {item.title}</b>
                <div className="cell-sub">{item.desc}</div>
              </div>
              <span className={`badge ${item.status === 'Complete' ? 'green' : 'amber'}`}>
                {item.status}
              </span>
            </div>
          ))}
        </div>

        <div className="mt20">
          <label className="caption">Disclosures & Management Representation Notes</label>
          <textarea
            className="input"
            rows={3}
            value={packageNotes}
            onChange={e => setPackageNotes(e.target.value)}
          />
        </div>
      </div>
    </div>
  );
};
