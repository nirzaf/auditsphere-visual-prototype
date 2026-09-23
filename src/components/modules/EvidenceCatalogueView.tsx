import React, { useState } from 'react';
import { RouteKey, EvidenceItem } from '../../types';
import { prototypeStore } from '../../store/prototypeStore';
import { Icon } from '../common/Icons';

interface EvidenceCatalogueViewProps {
  onNavigate: (route: RouteKey) => void;
}

export const EvidenceCatalogueView: React.FC<EvidenceCatalogueViewProps> = ({ onNavigate }) => {
  const state = prototypeStore.getSnapshot();
  const evidenceList = state.evidenceCatalogue;
  const [notice, setNotice] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  const handleToggleAdequacy = (id: string, current: EvidenceItem['adequacyStatus']) => {
    try {
      if (current === 'Adequate') {
        const rationale = prompt('Record the rationale for flagging this evidence as deficient:');
        if (rationale === null) return;
        prototypeStore.setEvidenceAdequacy(id, 'Deficient', rationale || 'Flagged deficient in review');
        setNotice({ type: 'success', text: 'Evidence marked deficient with attributable rationale.' });
      } else {
        prototypeStore.setEvidenceAdequacy(id, 'Adequate');
        setNotice({ type: 'success', text: 'Evidence status updated to Adequate.' });
      }
      setTimeout(() => setNotice(null), 4000);
    } catch (e) {
      setNotice({ type: 'error', text: (e as Error).message });
      setTimeout(() => setNotice(null), 6000);
    }
  };

  return (
    <div className="stack" style={{ gap: 20 }}>
      <div className="pagehead">
        <div>
          <h1>Evidence Catalogue</h1>
          <p>Version-pinned document references, cryptographic SHA checksums, and adequacy determinations.</p>
        </div>
        <button className="btn sm ghost" onClick={() => onNavigate('documents')}>
          <Icon name="folder" /> SharePoint Document Library
        </button>
      </div>

      {notice && (
        <div className={`badge ${notice.type === 'error' ? 'danger' : 'success'}`} style={{ padding: '8px 12px', display: 'block', fontSize: 13 }}>
          {notice.text}
        </div>
      )}

      <div className="panel panel-pad" style={{ background: '#fffbeb', borderLeft: '4px solid #d97706' }}>
        <b>Prototype note — evidence replacement impact.</b>
        <p className="sub mt4">
          Adequacy changes here are persisted and attributable. Flagging an evidence version as
          deficient does not yet automatically mark dependent procedures, workpapers or reviews as
          requiring reassessment; reviewers must open each linked subject and re-clear it explicitly.
          Document-to-evidence version comparison is a manual side-by-side check in the library.
        </p>
      </div>

      <div className="panel">
        <div className="panel-head">
          <h3>Registered Audit Evidence ({evidenceList.length})</h3>
          <span className="caption">ISA 500 Audit Evidence Pinned References</span>
        </div>
        <div className="tablewrap">
          <table>
            <thead>
              <tr>
                <th>Evidence Item</th>
                <th>File Reference</th>
                <th>Source & Provider</th>
                <th>SHA-256 Checksum</th>
                <th>Linked Procedures</th>
                <th>Adequacy Status</th>
                <th>Action</th>
              </tr>
            </thead>
            <tbody>
              {evidenceList.map((item: any) => (
                <tr key={item.id}>
                  <td>
                    <b>{item.name || item.title}</b>
                    <div className="cell-sub">{item.id}</div>
                  </td>
                  <td><span className="mono">{item.documentId}</span></td>
                  <td>{item.provider || item.owner}</td>
                  <td><span className="mono" style={{ fontSize: 10 }}>{(item.sha || 'e3b0c44298fc1c14').slice(0, 16)}...</span></td>
                  <td>
                    {(item.linkedProcedures || []).map((p: string) => (
                      <span key={p} className="tag gray" style={{ marginRight: 4 }}>{p}</span>
                    ))}
                  </td>
                  <td>
                    <span className={`badge ${item.adequacyStatus === 'Adequate' ? 'green' : 'amber'}`}>
                      {item.adequacyStatus}
                    </span>
                  </td>
                  <td>
                    <button
                      className="btn sm ghost"
                      onClick={() => handleToggleAdequacy(item.id, item.adequacyStatus)}
                    >
                      {item.adequacyStatus === 'Adequate' ? 'Flag Deficient' : 'Mark Adequate'}
                    </button>
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
