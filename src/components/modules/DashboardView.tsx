// Module 01: Practice Dashboard (VP-005, VP-060)
import React from 'react';
import { PrototypeState, RouteKey } from '../../types';
import { prototypeStore } from '../../store/prototypeStore';
import { visibleEngagementIds } from '../../services/guards';
import { Icon } from '../common/Icons';

interface DashboardViewProps {
  onNavigate: (route: RouteKey) => void;
}

export const DashboardView: React.FC<DashboardViewProps> = ({ onNavigate }) => {
  const state = prototypeStore.getSnapshot();
  const visibleIds = visibleEngagementIds(state);
  const engagements = visibleIds === 'ALL' ? state.engagements : state.engagements.filter(e => visibleIds.includes(e.id));
  const clientIds = new Set(engagements.map(e => e.client));
  const clients = state.clients.filter(c => clientIds.has(c.id));
  const activeEngagements = engagements.filter(e => !e.archive).length;
  const totalOpenReviews = engagements.reduce(
    (sum, e) => sum + e.reviews.filter(r => r.status !== 'Cleared').length,
    0
  );
  const totalOpenPBC = engagements.reduce(
    (sum, e) => sum + e.pbc.filter(p => p.status !== 'Accepted').length,
    0
  );
  const readyToRelease = engagements.filter(e => {
    return e.workpapers.every(w => w.status === 'Cleared') && e.reviews.every(r => r.status === 'Cleared');
  }).length;

  const currentEng = engagements.find(e => e.id === state.selectedEngagement) || engagements[0];
  const client = clients.find(c => c.id === currentEng?.client);
  const events = visibleIds === 'ALL' ? state.events.slice(0, 4) : state.events.filter(ev => visibleIds.some(id => ev.ref === id || ev.ref.startsWith(`${id} ·`))).slice(0, 4);

  return (
    <div className="stack" style={{ gap: 20 }}>
      {/* Header */}
      <div className="pagehead">
        <div>
          <h1>A clear view of every engagement.</h1>
          <p>Your practice, in sync. Client work, reviews, and deadlines in one place.</p>
        </div>
        <div className="row" style={{ gap: 10 }}>
          <span className="btn sm">
            <Icon name="calendar" />
            {new Date(`${state.asOfDate}T00:00:00`).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric', timeZone: 'UTC' })} · As of date
          </span>
          <button className="btn primary sm" onClick={() => onNavigate('engagements')}>
            <Icon name="plus" />
            New Engagement
          </button>
        </div>
      </div>

      {/* Metrics Row */}
      <div className="metric-grid">
        <div className="metric" onClick={() => onNavigate('engagements')} style={{ cursor: 'pointer' }}>
          <div className="between">
            <span className="metric-label">Active Engagements</span>
            <Icon name="brief" />
          </div>
          <div className="metric-val">{activeEngagements}</div>
          <span className="metric-sub">Across {clients.length} synthetic clients</span>
        </div>

        <div className="metric purple" onClick={() => onNavigate('reviews')} style={{ cursor: 'pointer' }}>
          <div className="between">
            <span className="metric-label">Awaiting Review</span>
            <Icon name="message" />
          </div>
          <div className="metric-val">{totalOpenReviews}</div>
          <span className="metric-sub">Open review points across practice</span>
        </div>

        <div className="metric blue" onClick={() => onNavigate('documents')} style={{ cursor: 'pointer' }}>
          <div className="between">
            <span className="metric-label">Client Requests</span>
            <Icon name="folder" />
          </div>
          <div className="metric-val">{totalOpenPBC}</div>
          <span className="metric-sub">Information awaiting client or review</span>
        </div>

        <div className="metric amber" onClick={() => onNavigate('delivery')} style={{ cursor: 'pointer' }}>
          <div className="between">
            <span className="metric-label">Ready to Release</span>
            <Icon name="shield" />
          </div>
          <div className="metric-val">{readyToRelease}</div>
          <span className="metric-sub">Packages with all workpapers cleared</span>
        </div>
      </div>

      {/* Main Grid: Left = Table & Activity; Right = Focus & Distribution */}
      <div className="grid-main">
        <div className="stack" style={{ gap: 20 }}>
          {/* Engagement Portfolio */}
          <div className="panel">
            <div className="panel-head">
              <div>
                <h2>Engagement Portfolio</h2>
                <p className="sub">Every client. One connected workflow.</p>
              </div>
              <span className="tag gray">FY 2026</span>
            </div>
            <div className="tablewrap">
              <table>
                <thead>
                  <tr>
                    <th>Client & Engagement</th>
                    <th>Service</th>
                    <th>Status</th>
                    <th>Target Date</th>
                    <th>Manager</th>
                    <th>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {engagements.map(eng => {
                    const c = clients.find(x => x.id === eng.client);
                    return (
                      <tr key={eng.id}>
                        <td>
                          <b>{c?.name || 'Client'}</b>
                          <div className="cell-sub">{eng.id} · FY {eng.year}</div>
                        </td>
                        <td>{eng.service}</td>
                        <td>
                          <span className={`badge ${eng.stage === 'Review' ? 'purple' : 'teal'}`}>
                            {eng.stage}
                          </span>
                        </td>
                        <td>{eng.due}</td>
                        <td>{eng.manager}</td>
                        <td>
                          <button
                            className="btn sm"
                            onClick={() => {
                              prototypeStore.setSelectedEngagement(eng.id);
                              onNavigate('engagements');
                            }}
                          >
                            Open
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>

          {/* Priority Attention */}
          <div className="panel panel-pad">
            <h3>Your Attention, Where It Matters</h3>
            <p className="sub" style={{ marginBottom: 16 }}>Prioritized next actions for selected engagement ({currentEng?.id}).</p>
            <div className="stack" style={{ gap: 12 }}>
              <div className="taskrow">
                <div className="taskcheck purple">
                  <Icon name="message" />
                </div>
                <div style={{ flex: 1 }}>
                  <h4>{currentEng?.reviews.filter(r => r.status !== 'Cleared').length} review points need a response</h4>
                  <p className="sub">{client?.name} · Fixed assets and related disclosures</p>
                </div>
                <button className="btn sm" onClick={() => onNavigate('reviews')}>Open Desk</button>
              </div>

              <div className="taskrow">
                <div className="taskcheck blue">
                  <Icon name="folder" />
                </div>
                <div style={{ flex: 1 }}>
                  <h4>Verify client evidence requests</h4>
                  <p className="sub">Fixed asset register and customer confirmations outstanding</p>
                </div>
                <button className="btn sm" onClick={() => onNavigate('documents')}>View Requests</button>
              </div>

              <div className="taskrow">
                <div className="taskcheck green">
                  <Icon name="checkcircle" />
                </div>
                <div style={{ flex: 1 }}>
                  <h4>Protect exact-version release gates</h4>
                  <p className="sub">Independent reviewer sign-off, management approval, partner sign-off</p>
                </div>
                <button className="btn sm" onClick={() => onNavigate('delivery')}>Check Gates</button>
              </div>
            </div>
          </div>
        </div>

        {/* Right Stack */}
        <div className="stack" style={{ gap: 20 }}>
          {/* Today's Focus Card */}
          <div className="focus-card">
            <div className="focus-label">Today's Focus</div>
            <div className="focus-title">Move the review forward.<br />Keep the evidence intact.</div>
            <p style={{ margin: '10px 0 16px 0', fontSize: 13 }}>
              Explore a full correction loop from an open review point to an approved and released financial package.
            </p>
            <button className="btn primary sm" onClick={() => onNavigate('reviews')}>
              Continue Review
            </button>
          </div>

          {/* Where Work Stands */}
          <div className="panel panel-pad">
            <h3>Where Work Stands</h3>
            <p className="sub" style={{ marginBottom: 12 }}>Engagement stage distribution</p>
            <div className="stage-bars">
              <div className="stage-col">
              <b>{engagements.filter(e => e.stage === 'Planning').length}</b>
                <i style={{ height: 35 }} />
                <span>Planning</span>
              </div>
              <div className="stage-col">
              <b>{engagements.filter(e => e.stage === 'Fieldwork').length}</b>
                <i style={{ height: 45 }} />
                <span>Fieldwork</span>
              </div>
              <div className="stage-col">
              <b>{engagements.filter(e => e.stage === 'Review').length}</b>
                <i style={{ height: 60 }} />
                <span>Review</span>
              </div>
              <div className="stage-col">
              <b>{engagements.filter(e => e.stage === 'Accounting').length}</b>
                <i style={{ height: 30 }} />
                <span>Accounting</span>
              </div>
            </div>
          </div>

          {/* Recent Activity */}
          <div className="panel panel-pad">
            <div className="between" style={{ marginBottom: 12 }}>
              <h3>Recent Demo Activity</h3>
              <span className="caption">In-memory log</span>
            </div>
            <div className="stack" style={{ gap: 10 }}>
              {events.map((ev, i) => (
                <div key={i} className="activity">
                  <div className="activity-dot">
                    <Icon name={ev.type} size="sm" />
                  </div>
                  <div>
                    <p style={{ fontSize: 12 }}>{ev.text}</p>
                    <small>{ev.ref} · {ev.time}</small>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
