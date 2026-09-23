// Module 10 & 18: SharePoint Document Browser & Library (VP-020, VP-021)
import React, { useState } from 'react';
import { RouteKey, DocumentItem } from '../../types';
import { prototypeStore } from '../../store/prototypeStore';
import { Icon } from '../common/Icons';
import { sha256OfFile } from '../../services/fileMetadata';

interface DocumentsLibraryViewProps {
  onNavigate: (route: RouteKey) => void;
}

export const DocumentsLibraryView: React.FC<DocumentsLibraryViewProps> = ({ onNavigate }) => {
  const state = prototypeStore.getSnapshot();
  const [selectedFolder, setSelectedFolder] = useState<string>('/Engagements/2026/');
  const [previewDoc, setPreviewDoc] = useState<DocumentItem | null>(null);
  const [showUploadModal, setShowUploadModal] = useState(false);
  const [showOneDriveModal, setShowOneDriveModal] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);

  // New file form
  const [uploadFile, setUploadFile] = useState<File | null>(null);
  const [classification, setClassification] = useState<DocumentItem['classification']>('Working paper');
  const [folderPath, setFolderPath] = useState('/Engagements/2026/Audit/');

  const documents = state.documents;
  const filteredDocs = selectedFolder === '/'
    ? documents
    : documents.filter(d => d.folderPath.startsWith(selectedFolder));

  const folders = (state.folders && state.folders.length > 0)
    ? state.folders
    : [
        { path: '/Engagements/2026/', label: 'All 2026 Engagements' },
        { path: '/Engagements/2026/Accounting/', label: 'Accounting & Trial Balances' },
        { path: '/Engagements/2026/Audit/', label: 'Audit Substantive Testing' },
        { path: '/Engagements/2026/Deliverables/', label: 'Published Deliverables' },
        { path: '/PBC/', label: 'Client PBC Submissions' }
      ];

  const handleUploadSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!uploadFile) return;

    const currentEng = state.engagements.find(e => e.id === state.selectedEngagement);
    if (!currentEng) { setNotice('Select an engagement before registering a file.'); return; }
    const sha = await sha256OfFile(uploadFile);
    const newDoc: DocumentItem = {
      id: `DOC-${crypto.randomUUID()}`,
      clientId: currentEng.client,
      engagementId: currentEng.id,
      name: uploadFile.name,
      folderPath,
      version: 1,
      size: uploadFile.size,
      sha,
      classification,
      visibility: classification === 'Deliverable' ? 'Client shared' : 'Internal',
      source: 'Local In-Session',
      uploadedBy: state.currentPerson,
      uploadedAt: new Date().toISOString()
    };

    try {
      prototypeStore.addDocument(newDoc);
      setShowUploadModal(false);
      setUploadFile(null);
      setNotice(`${uploadFile.name} metadata recorded (SHA-256 ${sha.slice(0, 12)}…). File bytes remain local and are not saved or uploaded.`);
    } catch (err) { setNotice(err instanceof Error ? err.message : 'Document metadata could not be recorded.'); }
  };

  const handleImportFromOneDrive = (name: string) => {
    const currentEng = state.engagements.find(e => e.id === state.selectedEngagement);
    const result = state.m365Config.verificationResults?.onedrive;
    if (!currentEng || !state.m365Config.oneDriveEnabled || result?.outcome !== 'success' || result.configRevision !== state.m365Config.configRevision) {
      setNotice('OneDrive import simulation requires an enabled option and a current success result for this configuration.');
      return;
    }
    const newDoc: DocumentItem = {
      id: `DOC-${crypto.randomUUID()}`,
      clientId: currentEng.client,
      engagementId: currentEng.id,
      name,
      folderPath: '/Engagements/2026/Audit/',
      version: 1,
      size: 65000,
      classification: 'Client provided',
      visibility: 'Internal',
      source: 'OneDrive Import',
      uploadedBy: state.currentPerson,
      uploadedAt: new Date().toISOString()
    };

    prototypeStore.addDocument(newDoc);
    setShowOneDriveModal(false);
  };

  return (
    <div className="stack" style={{ gap: 20 }}>
      <div className="pagehead">
        <div>
          <h1>Documents & SharePoint Library</h1>
          <p>SharePoint-first file structures, version pinned references, and Microsoft 365 file access.</p>
        </div>
        <div className="row" style={{ gap: 10 }}>
          <button className="btn sm ghost" onClick={() => setShowOneDriveModal(true)}>
            <Icon name="folder" /> Import from OneDrive
          </button>
          <button className="btn primary sm" onClick={() => setShowUploadModal(true)}>
            <Icon name="plus" /> Register File
          </button>
        </div>
      </div>

      {notice && (
        <div className="badge success" style={{ padding: '8px 12px', display: 'block', fontSize: 13 }}>
          {notice}
        </div>
      )}

      <div className="grid-main">
        {/* Left: Folder Hierarchy */}
        <div className="stack" style={{ gap: 16 }}>
          <div className="panel panel-pad">
            <h3>SharePoint Folders</h3>
            <p className="sub" style={{ marginBottom: 12 }}>
              Site: <code>ClientEngagements/2026</code>
            </p>
            <div className="stack" style={{ gap: 4 }}>
              {folders.map(f => (
                <button
                  key={f.path}
                  className={`navitem ${selectedFolder === f.path ? 'active' : ''}`}
                  onClick={() => setSelectedFolder(f.path)}
                  style={{ textAlign: 'left', width: '100%', fontSize: 13 }}
                >
                  <Icon name="folder" />
                  <span>{f.label}</span>
                </button>
              ))}
            </div>

            <div className="divider" />
            <button
              className="btn sm"
              style={{ width: '100%' }}
              onClick={() => {
                prototypeStore.prepareClientWorkspace(state.clients[0]?.id || 'CL-001');
                setNotice('SharePoint workspace folder structure verified and provisioned.');
                setTimeout(() => setNotice(null), 4000);
              }}
            >
              Verify Client Workspace
            </button>
          </div>
        </div>

        {/* Right: Files in Folder */}
        <div className="stack" style={{ gap: 16 }}>
          <div className="panel">
            <div className="panel-head">
              <div>
                <h3>Files in {selectedFolder}</h3>
                <span className="caption">{filteredDocs.length} items in view</span>
              </div>
            </div>
            <div className="tablewrap">
              <table>
                <thead>
                  <tr>
                    <th>Document Name</th>
                    <th>Version</th>
                    <th>Classification</th>
                    <th>Source</th>
                    <th>Uploaded By</th>
                    <th>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredDocs.map(doc => (
                    <tr key={doc.id}>
                      <td>
                        <div className="row" style={{ gap: 8 }}>
                          <Icon name="file" />
                          <div>
                            <b>{doc.name}</b>
                            <div className="cell-sub">{doc.id} · {(doc.size / 1024).toFixed(1)} KB</div>
                          </div>
                        </div>
                      </td>
                      <td><span className="mono">v{doc.version}</span></td>
                      <td><span className="tag gray">{doc.classification}</span></td>
                      <td>
                        <span className={`tag ${doc.source === 'SharePoint' ? 'blue' : 'purple'}`}>
                          {doc.source}
                        </span>
                      </td>
                      <td>{doc.uploadedBy}</td>
                      <td>
                        <button
                          className="btn sm"
                          onClick={() => setPreviewDoc(doc)}
                        >
                          Open in M365
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      </div>

      {/* Simulated M365 Viewer Modal */}
      {previewDoc && (
        <div className="modal-backdrop" onClick={() => setPreviewDoc(null)}>
          <div className="modal" style={{ maxWidth: 640 }} onClick={e => e.stopPropagation()}>
            <div className="modal-head">
              <div className="row" style={{ gap: 10 }}>
                <Icon name="file" />
                <div>
                  <h3>Local metadata preview: {previewDoc.name}</h3>
                  <div className="cell-sub">No original file bytes are stored in this prototype</div>
                </div>
              </div>
              <button className="icon-btn" onClick={() => setPreviewDoc(null)}>✕</button>
            </div>
            <div className="modal-body stack" style={{ gap: 16 }}>
              <div className="borderbox" style={{ background: '#f8fafc', padding: 16 }}>
                <div className="between">
                  <b>Metadata & Governance</b>
                  <span className="mono">v{previewDoc.version}</span>
                </div>
                <div className="info-grid mt12">
                  <div><label>Classification</label><span>{previewDoc.classification}</span></div>
                  <div><label>Storage Source</label><span>{previewDoc.source}</span></div>
                  <div><label>SHA-256</label><span className="mono" style={{ fontSize: 10 }}>{previewDoc.sha ? `${previewDoc.sha.slice(0, 24)}…` : 'Not available for sample metadata'}</span></div>
                  <div><label>Uploaded By</label><span>{previewDoc.uploadedBy}</span></div>
                  <div><label>Uploaded Date</label><span>{new Date(previewDoc.uploadedAt).toLocaleDateString('en-GB')}</span></div>
                </div>
              </div>

              <div className="borderbox" style={{ padding: 16, minHeight: 120 }}>
                <h4>Sample preview</h4>
                <p className="sub mt8" style={{ fontFamily: 'monospace', fontSize: 12 }}>
                  Original file content is unavailable. This screen shows metadata only.<br />
                  Linked to engagement: {previewDoc.engagementId || 'No engagement'}
                </p>
              </div>
            </div>
            <div className="modal-foot">
              <button className="btn sm ghost" onClick={() => setPreviewDoc(null)}>Close Viewer</button>
            </div>
          </div>
        </div>
      )}

      {/* Register File Modal */}
      {showUploadModal && (
        <div className="modal-backdrop" onClick={() => setShowUploadModal(false)}>
          <div className="modal" style={{ maxWidth: 480 }} onClick={e => e.stopPropagation()}>
            <div className="modal-head">
              <h2>Register Document into SharePoint</h2>
              <button className="icon-btn" onClick={() => setShowUploadModal(false)}>✕</button>
            </div>
            <form onSubmit={handleUploadSubmit}>
              <div className="modal-body stack" style={{ gap: 12 }}>
                <div>
                    <label className="caption">Choose a local file</label>
                    <input
                    type="file"
                    className="input"
                    onChange={e => setUploadFile(e.target.files?.[0] || null)}
                    required
                  />
                  <span className="caption">Metadata is recorded locally. The original file is not uploaded or persisted by this prototype.</span>
                </div>
                <div>
                  <label className="caption">Target SharePoint Folder</label>
                  <select
                    className="input"
                    value={folderPath}
                    onChange={e => setFolderPath(e.target.value)}
                  >
                    <option value="/Engagements/2026/Accounting/">/Engagements/2026/Accounting/</option>
                    <option value="/Engagements/2026/Audit/">/Engagements/2026/Audit/</option>
                    <option value="/Engagements/2026/Audit/Workpapers/">/Engagements/2026/Audit/Workpapers/</option>
                    <option value="/Engagements/2026/Deliverables/">/Engagements/2026/Deliverables/</option>
                  </select>
                </div>
                <div>
                  <label className="caption">Classification</label>
                  <select
                    className="input"
                    value={classification}
                    onChange={e => setClassification(e.target.value as any)}
                  >
                    <option value="Client provided">Client provided</option>
                    <option value="Working paper">Working paper</option>
                    <option value="Deliverable">Deliverable</option>
                    <option value="Correspondence">Correspondence</option>
                  </select>
                </div>
              </div>
              <div className="modal-foot">
                <button type="button" className="btn ghost sm" onClick={() => setShowUploadModal(false)}>Cancel</button>
                <button type="submit" className="btn primary sm" disabled={!uploadFile}>Record file metadata</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* OneDrive Import Modal */}
      {showOneDriveModal && (
        <div className="modal-backdrop" onClick={() => setShowOneDriveModal(false)}>
          <div className="modal" style={{ maxWidth: 480 }} onClick={e => e.stopPropagation()}>
            <div className="modal-head">
              <h2>Import from OneDrive for Business</h2>
              <button className="icon-btn" onClick={() => setShowOneDriveModal(false)}>✕</button>
            </div>
            <div className="modal-body stack" style={{ gap: 12 }}>
              <p className="sub">This local fixture list represents optional OneDrive selection. No Microsoft connection or file import occurs.</p>
              <div className="stack" style={{ gap: 8 }}>
                {[
                  'Fixed_Asset_Additions_Schedule_2026.xlsx',
                  'Board_Minutes_Approval_FY2026.pdf',
                  'Intercompany_Reconciliation_Memo.docx'
                ].map(file => (
                  <div key={file} className="between borderbox" style={{ padding: 10 }}>
                    <span style={{ fontSize: 13 }}>{file}</span>
                    <button
                      className="btn sm"
                      onClick={() => handleImportFromOneDrive(file)}
                    >
                      Record sample metadata
                    </button>
                  </div>
                ))}
              </div>
            </div>
            <div className="modal-foot">
              <button className="btn sm ghost" onClick={() => setShowOneDriveModal(false)}>Close</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
