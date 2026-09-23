// Module 31: Substantive Sampling & Population Testing (VP-051)
import React, { useState } from 'react';
import { RouteKey, SamplePopulationRecord } from '../../types';
import { prototypeStore } from '../../store/prototypeStore';
import { Icon } from '../common/Icons';
import { formatCurrency } from '../../services/calculations';

interface SamplingViewProps {
  onNavigate: (route: RouteKey) => void;
}

export const SamplingView: React.FC<SamplingViewProps> = ({ onNavigate }) => {
  const state = prototypeStore.getSnapshot();
  const population = state.samplePopulations[0] || {
    id: 'SMP-01',
    engagementId: state.selectedEngagement,
    name: 'Additions to Property, Plant & Equipment',
    accountCode: '1200',
    totalPopulationValue: 350000,
    totalPopulationCount: 18,
    sampleSize: 5,
    methodology: 'High-value items above performance materiality (QAR 22,500) plus haphazard sample.',
    items: [
      { id: 'SMP-ITM-01', identifier: 'INV-EQ-881', description: 'Forklift industrial vehicle', recordedAmount: 85000, auditedAmount: 85000, difference: 0, tested: true, result: 'Satisfactory', notes: 'Vouched to vendor invoice and customs clearance.' },
      { id: 'SMP-ITM-02', identifier: 'INV-EQ-890', description: 'Warehouse cold storage compressor', recordedAmount: 64000, auditedAmount: 64000, difference: 0, tested: true, result: 'Satisfactory', notes: 'Vouched to purchase agreement and bank payment.' },
      { id: 'SMP-ITM-03', identifier: 'INV-EQ-915', description: 'Server infrastructure upgrade', recordedAmount: 42000, auditedAmount: 42000, difference: 0, tested: true, result: 'Satisfactory', notes: 'Inspected physical asset and serial tag in data center.' },
      { id: 'SMP-ITM-04', identifier: 'INV-EQ-940', description: 'Office air conditioning overhaul', recordedAmount: 38000, auditedAmount: 38000, difference: 0, tested: true, result: 'Satisfactory', notes: 'Inspected engineering installation certificate.' },
      { id: 'SMP-ITM-05', identifier: 'INV-EQ-988', description: 'ERP software license renewal (Expense misclassified as FA)', recordedAmount: 28000, auditedAmount: 0, difference: 28000, tested: true, result: 'Exception', notes: 'Annual software SaaS subscription misclassified as capital asset.', findingId: 'FND-01' }
    ]
  };

  const exceptionsCount = population.items.filter(i => i.result === 'Exception' || i.result === 'Exception noted').length;
  const totalAuditedDiff = population.items.reduce((s, i) => s + (i.difference || 0), 0);

  return (
    <div className="stack" style={{ gap: 20 }}>
      <div className="pagehead">
        <div>
          <h1>Substantive Sampling & Population Testing</h1>
          <p>ISA 530 audit sampling design, substantive sample items, and exception accumulation.</p>
        </div>
        <div className="row" style={{ gap: 10 }}>
          <button className="btn sm ghost" onClick={() => onNavigate('findings')}>
            <Icon name="target" /> View Audit Findings ({state.findings.length})
          </button>
          <button className="btn primary sm" onClick={() => onNavigate('audit')}>
            <Icon name="checkboard" /> Workpapers
          </button>
        </div>
      </div>

      <div className="panel panel-pad">
        <div className="between">
          <div>
            <span className="eyebrow">SAMPLE POPULATION · {population.id}</span>
            <h2>{population.name}</h2>
            <p className="sub">Account: {population.accountCode} · Total Population Value: {formatCurrency(population.totalPopulationValue)}</p>
          </div>
          <span className={`badge ${exceptionsCount > 0 ? 'amber' : 'green'}`}>
            {exceptionsCount > 0 ? `${exceptionsCount} Exception(s) Noted` : 'All Sample Items Satisfactory'}
          </span>
        </div>

        <div className="borderbox mt16" style={{ background: '#f8fafc', padding: 12 }}>
          <b>Sampling Methodology Rationale:</b>
          <p className="sub mt4">{population.methodology}</p>
        </div>

        <div className="metric-grid mt16">
          <div className="metric">
            <span className="metric-label">Population Items</span>
            <div className="metric-val">{population.totalPopulationCount}</div>
            <span className="metric-sub">Value: {formatCurrency(population.totalPopulationValue)}</span>
          </div>
          <div className="metric blue">
            <span className="metric-label">Sample Items Tested</span>
            <div className="metric-val">{population.items.length}</div>
            <span className="metric-sub">Coverage: {Math.round((population.items.reduce((s, i) => s + (i.recordedAmount || i.amount || 0), 0) / (population.totalPopulationValue || 1)) * 100)}% of value</span>
          </div>
          <div className="metric amber">
            <span className="metric-label">Substantive Exceptions</span>
            <div className="metric-val">{exceptionsCount}</div>
            <span className="metric-sub">Accumulated Difference: {formatCurrency(totalAuditedDiff)}</span>
          </div>
        </div>
      </div>

      <div className="panel">
        <div className="panel-head">
          <h3>Sample Vouching Schedule</h3>
          <span className="caption">Individual Item Fieldwork</span>
        </div>
        <div className="tablewrap">
          <table>
            <thead>
              <tr>
                <th>Voucher / Ref</th>
                <th>Item Description</th>
                <th style={{ textAlign: 'right' }}>Recorded Amount</th>
                <th style={{ textAlign: 'right' }}>Audited Amount</th>
                <th style={{ textAlign: 'right' }}>Difference</th>
                <th>Result</th>
                <th>Fieldwork Notes</th>
                <th>Linked Finding</th>
              </tr>
            </thead>
            <tbody>
              {population.items.map(item => (
                <tr key={item.id}>
                  <td><b>{item.identifier}</b></td>
                  <td>{item.description}</td>
                  <td style={{ textAlign: 'right' }}>{formatCurrency(item.recordedAmount || item.amount || 0)}</td>
                  <td style={{ textAlign: 'right' }}>{formatCurrency(item.auditedAmount ?? item.recordedAmount ?? item.amount ?? 0)}</td>
                  <td style={{ textAlign: 'right' }}>
                    <b style={{ color: (item.difference || 0) > 0 ? 'red' : 'inherit' }}>
                      {(item.difference || 0) > 0 ? formatCurrency(item.difference || 0) : '—'}
                    </b>
                  </td>
                  <td>
                    <span className={`badge ${item.result === 'Satisfactory' ? 'green' : 'amber'}`}>
                      {item.result}
                    </span>
                  </td>
                  <td>{item.notes}</td>
                  <td>
                    {item.findingId ? (
                      <button
                        className="btn sm ghost"
                        onClick={() => onNavigate('findings')}
                      >
                        {item.findingId}
                      </button>
                    ) : (
                      <span className="caption">—</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};
