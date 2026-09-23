// Module 28: Audit Planning & Materiality (VP-048)
import React, { useState } from 'react';
import { RouteKey } from '../../types';
import { prototypeStore } from '../../store/prototypeStore';
import { Icon } from '../common/Icons';
import { calculateMateriality, formatCurrency } from '../../services/calculations';

interface AuditPlanningViewProps {
  onNavigate: (route: RouteKey) => void;
}

export const AuditPlanningView: React.FC<AuditPlanningViewProps> = ({ onNavigate }) => {
  const state = prototypeStore.getSnapshot();
  const selectedEng = state.engagements.find(e => e.id === state.selectedEngagement) || state.engagements[0];
  const client = state.clients.find(c => c.id === selectedEng?.client);

  const [benchmarkType, setBenchmarkType] = useState<'profit' | 'revenue' | 'assets' | 'equity'>('revenue');
  const [benchmarkValue, setBenchmarkValue] = useState<number>(client?.revenue || 2000000);
  const [percentage, setPercentage] = useState<number>(1.5);
  const [scopeNotes, setScopeNotes] = useState('Standard external audit scope focused on revenue cutoff, bank confirmations, inventory valuation, and intercompany balances.');

  const materiality = calculateMateriality(benchmarkValue, percentage);

  return (
    <div className="stack" style={{ gap: 20 }}>
      <div className="pagehead">
        <div>
          <h1>Audit Planning & Materiality Determination</h1>
          <p>ISA 320 quantitative materiality thresholds, performance haircut, and clearly trivial misstatement boundary.</p>
        </div>
        <button className="btn primary sm" onClick={() => onNavigate('audit-risks')}>
          <Icon name="shield" /> Audit Risk Register
        </button>
      </div>

      {/* Materiality Calculator */}
      <div className="panel panel-pad">
        <div className="between">
          <div>
            <span className="eyebrow">ISA 320 QUANTITATIVE BENCHMARK</span>
            <h2>{client?.name} · Materiality Strategy</h2>
            <p className="sub">Engagement: {selectedEng.id} · Currency: {selectedEng.currency}</p>
          </div>
          <span className="badge teal">Planning Phase</span>
        </div>

        <div className="grid3 mt20">
          <div>
            <label className="caption">Financial Benchmark Basis</label>
            <select
              className="input"
              value={benchmarkType}
              onChange={e => setBenchmarkType(e.target.value as any)}
            >
              <option value="revenue">Annual Gross Revenue (0.5% – 2%)</option>
              <option value="profit">Profit Before Tax (5% – 10%)</option>
              <option value="assets">Total Balance Sheet Assets (1% – 2%)</option>
              <option value="equity">Net Equity (2% – 5%)</option>
            </select>
          </div>
          <div>
            <label className="caption">Benchmark Value (QAR)</label>
            <input
              type="number"
              className="input"
              value={benchmarkValue}
              onChange={e => setBenchmarkValue(Number(e.target.value))}
            />
          </div>
          <div>
            <label className="caption">Applied Benchmark Rate (%)</label>
            <input
              type="number"
              step={0.1}
              className="input"
              value={percentage}
              onChange={e => setPercentage(Number(e.target.value))}
            />
          </div>
        </div>

        {/* Calculated Thresholds */}
        <div className="metric-grid mt20">
          <div className="metric purple">
            <span className="metric-label">Overall Planning Materiality (PM)</span>
            <div className="metric-val">{formatCurrency(materiality.overallMateriality)}</div>
            <span className="metric-sub">{percentage}% of {formatCurrency(benchmarkValue)}</span>
          </div>

          <div className="metric blue">
            <span className="metric-label">Performance Materiality (Haircut 75%)</span>
            <div className="metric-val">{formatCurrency(materiality.performanceMateriality)}</div>
            <span className="metric-sub">Substantive testing threshold</span>
          </div>

          <div className="metric amber">
            <span className="metric-label">Clearly Trivial Threshold (5%)</span>
            <div className="metric-val">{formatCurrency(materiality.clearlyTrivialThreshold)}</div>
            <span className="metric-sub">Differences below this are not accumulated</span>
          </div>
        </div>

        <div className="mt20">
          <label className="caption">Planning Memo & Substantive Scope Strategy</label>
          <textarea
            className="input"
            rows={4}
            value={scopeNotes}
            onChange={e => setScopeNotes(e.target.value)}
          />
        </div>
      </div>
    </div>
  );
};
