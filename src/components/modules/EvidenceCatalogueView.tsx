// Module 33: Version-Pinned Evidence Catalogue (VP-053)
import React, { useState } from 'react';
import { RouteKey, EvidenceItem } from '../../types';
import { prototypeStore } from '../../store/prototypeStore';
import { Icon } from '../common/Icons';

interface EvidenceCatalogueViewProps {
  onNavigate: (route: RouteKey) => void;
}

export const EvidenceCatalogueView: React.FC<EvidenceCatalogueViewProps> = ({ onNavigate }) => {
  const state = prototypeStore.getSnapshot();
  const [evidenceList, setEvidenceList] = useState<EvidenceItem[]>(state.evidenceCatalogue);

  const handleToggleAdequacy = (id: string) => {
    setEvidenceList(prev => prev.map(item => {
      if (item.id === id) {
        const nextStatus = item.adequacyStatus === 'Adequate' ? 'Inadequate' : 'Adequate';
        return { ...item, adequacyStatus: nextStatus };
      }
      return item;
    }));
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
                      onClick={() => handleToggleAdequacy(item.id)}
                    >
                      {item.adequacyStatus === 'Adequate' ? 'Flag Inadequate' : 'Mark Adequate'}
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
