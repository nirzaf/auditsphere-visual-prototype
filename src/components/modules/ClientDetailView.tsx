// Module 02 & 17: Centralized Client 360 Workspace (VP-008)
// 12 Tabs: Overview, Contacts, Engagements, Jobs, Documents, Requests, Communications, Time/Budgets, Billing, Accounting, Audit, Activity

import React, { useState } from 'react';
import { RouteKey, ClientContact, PbcRequestItem, CustomFieldDefinition } from '../../types';
import { prototypeStore } from '../../store/prototypeStore';
import { Icon } from '../common/Icons';
import { formatCurrency, formatMinutesToHours } from '../../services/calculations';

interface ClientDetailViewProps {
  clientId: string;
  searchTargetId?: string;
  onBack: () => void;
  onNavigate: (route: RouteKey) => void;
}

export const ClientDetailView: React.FC<ClientDetailViewProps> = ({ clientId, searchTargetId, onBack, onNavigate }) => {
  const state = prototypeStore.getSnapshot();
  const searchContact = state.contacts.find(contact => contact.id === searchTargetId && contact.clientId === clientId);
  const [activeTab, setActiveTab] = useState<
    | 'overview'
    | 'contacts'
    | 'engagements'
    | 'jobs'
    | 'documents'
    | 'requests'
    | 'communications'
    | 'time'
    | 'billing'
    | 'accounting'
    | 'audit'
    | 'activity'
  >(searchContact ? 'contacts' : searchTargetId && state.engagements.some(engagement => engagement.client === clientId && engagement.pbc.some(request => request.id === searchTargetId)) ? 'requests' : 'overview');

  const [showAddContact, setShowAddContact] = useState(false);
  const [contactName, setContactName] = useState('');
  const [contactEmail, setContactEmail] = useState('');
  const [contactTitle, setContactTitle] = useState('');
  const [customFieldId, setCustomFieldId] = useState(state.customFields.find(f => f.enabled !== false)?.id || '');
  const [customFieldValue, setCustomFieldValue] = useState('');
  const [clientNotice, setClientNotice] = useState('');
  const [newGroupName, setNewGroupName] = useState('');
  const [newFieldLabel, setNewFieldLabel] = useState('');
  const [newFieldType, setNewFieldType] = useState<CustomFieldDefinition['type']>('text');
  const [newFieldOptions, setNewFieldOptions] = useState('');
  const client = state.clients.find(c => c.id === clientId) || state.clients[0];
  const contacts = state.contacts.filter(c => c.clientId === client.id);
  const engagements = state.engagements.filter(e => e.client === client.id);
  const jobs = state.jobs.filter(j => j.clientId === client.id);
  const documents = state.documents.filter(d => d.clientId === client.id);
  const communications = state.communications.filter(c => c.clientId === client.id);
  const times = state.times.filter(t => t.clientId === client.id);
  const invoices = state.invoices.filter(i => i.clientId === client.id);
  const receipts = state.receipts.filter(r => r.clientId === client.id);
  const activeCustomFields = state.customFields.filter(field => field.enabled !== false);

  const [showPbcForm, setShowPbcForm] = useState(false);
  const [pbcEngagementId, setPbcEngagementId] = useState(engagements[0]?.id || '');
  const [pbcTitle, setPbcTitle] = useState('');
  const [pbcCategory, setPbcCategory] = useState('Financial records');
  const [pbcDue, setPbcDue] = useState(state.asOfDate);
  const [pbcContributor, setPbcContributor] = useState(client.contact || '');
  const [clarification, setClarification] = useState<{ engagementId: string; request: PbcRequestItem } | null>(null);
  const [clarificationText, setClarificationText] = useState('');
  const [requestNotice, setRequestNotice] = useState('');

  const pbcRequests = engagements.flatMap(e => e.pbc.map(request => ({ ...request, engagementId: e.id })));
  const workpapers = engagements.flatMap(e => e.workpapers);

  const tabs: Array<{ key: typeof activeTab; label: string; count?: number }> = [
    { key: 'overview', label: 'Overview' },
    { key: 'contacts', label: 'Contacts', count: contacts.length },
    { key: 'engagements', label: 'Engagements', count: engagements.length },
    { key: 'jobs', label: 'Jobs', count: jobs.length },
    { key: 'documents', label: 'Documents', count: documents.length },
    { key: 'requests', label: 'PBC Requests', count: pbcRequests.length },
    { key: 'communications', label: 'Communications', count: communications.length },
    { key: 'time', label: 'Time & Budgets' },
    { key: 'billing', label: 'Billing & AR', count: invoices.length },
    { key: 'accounting', label: 'Accounting' },
    { key: 'audit', label: 'Audit & Reviews', count: workpapers.length },
    { key: 'activity', label: 'Audit Log' }
  ];

  const handleAddContact = (e: React.FormEvent) => {
    e.preventDefault();
    if (!contactName.trim()) return;
    const newContact: ClientContact = {
      id: `CNT-${crypto.randomUUID()}`,
      clientId: client.id,
      name: contactName,
      email: contactEmail,
      title: contactTitle,
      isPrimary: contacts.length === 0,
      active: true,
      portalAccessRequested: false
    };
    try { prototypeStore.addContact(newContact); }
    catch (error) { setClientNotice(error instanceof Error ? error.message : 'Contact could not be saved.'); return; }
    setShowAddContact(false);
    setContactName('');
    setContactEmail('');
    setContactTitle('');
  };

  const handleSaveCustomField = (event: React.FormEvent) => {
    event.preventDefault();
    try {
      prototypeStore.setClientCustomField(client.id, customFieldId, customFieldValue);
      setClientNotice('Custom value saved to this client profile.');
      setCustomFieldValue('');
    } catch (error) { setClientNotice(error instanceof Error ? error.message : 'Custom value could not be saved.'); }
  };

  const handleCreatePbc = (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const request: PbcRequestItem = { id: `PBC-${crypto.randomUUID()}`, title: pbcTitle, category: pbcCategory, status: 'Draft', due: pbcDue, owner: state.currentPerson, contributor: pbcContributor, version: 1 };
      prototypeStore.addPbcRequest(pbcEngagementId, request);
      setRequestNotice('Draft information request saved. Present it when ready for the client portal.');
      setShowPbcForm(false);
      setPbcTitle('');
    } catch (err) { setRequestNotice(err instanceof Error ? err.message : 'Request could not be saved.'); }
  };

  const handlePresentPbc = (engagementId: string, requestId: string) => {
    try { prototypeStore.presentPbcRequest(engagementId, requestId); setRequestNotice('Information request presented to the client portal.'); }
    catch (err) { setRequestNotice(err instanceof Error ? err.message : 'Request could not be presented.'); }
  };

  const handleAcceptPbc = (engagementId: string, requestId: string) => {
    try { prototypeStore.acceptPbcResponse(engagementId, requestId); setRequestNotice('Client response accepted.'); }
    catch (err) { setRequestNotice(err instanceof Error ? err.message : 'Response could not be accepted.'); }
  };

  const handleClarification = (e: React.FormEvent) => {
    e.preventDefault();
    if (!clarification) return;
    try {
      prototypeStore.requestPbcClarification(clarification.engagementId, clarification.request.id, clarificationText);
      setClarification(null);
      setClarificationText('');
      setRequestNotice('Clarification requested; the client can replace its response.');
    } catch (err) { setRequestNotice(err instanceof Error ? err.message : 'Clarification could not be recorded.'); }
  };

  return (
    <div className="stack" style={{ gap: 16 }}>
      {/* Top breadcrumb & back button */}
      <div className="between">
        <button className="btn sm ghost" onClick={onBack}>
          <Icon name="arrow" /> Back to Portfolio
        </button>
        <span className="caption">Client ID: {client.id} · Code: {client.code}</span>
      </div>
      {clientNotice && <div role="status" className="panel panel-pad">{clientNotice}</div>}

      {/* Client Header Card */}
      <div className="panel panel-pad">
        <div className="between">
          <div className="row" style={{ gap: 16 }}>
            <div className="firmavatar" style={{ width: 48, height: 48, fontSize: 18 }}>
              {client.initials}
            </div>
            <div>
              <h2>{client.name}</h2>
              <div className="cell-sub">{client.tradingName || client.industry} · {client.jurisdiction}</div>
            </div>
          </div>
          <div className="row" style={{ gap: 10 }}>
            <span className={`badge ${client.status === 'Active' ? 'green' : 'gray'}`}>
              {client.status}
            </span>
            <span className={`badge ${client.risk === 'Low' ? 'green' : 'amber'}`}>
              {client.risk} Risk
            </span>
          </div>
        </div>

        {/* Workspace Tab Bar */}
        <div className="tabs mt16">
          {tabs.map(tab => (
            <button
              key={tab.key}
              className={`tab-btn ${activeTab === tab.key ? 'active' : ''}`}
              onClick={() => setActiveTab(tab.key)}
            >
              {tab.label}
              {tab.count !== undefined && tab.count > 0 && (
                <span className="count" style={{ marginLeft: 6 }}>{tab.count}</span>
              )}
            </button>
          ))}
        </div>
      </div>

      {/* Tab 1: Overview */}
      {activeTab === 'overview' && (
        <div className="grid-main">
          <div className="stack" style={{ gap: 16 }}>
            <div className="panel panel-pad">
              <h3>Legal Entity Information</h3>
              <div className="info-grid mt12">
                <div><label>Registration Number</label><span>{client.registrationNumber || 'N/A'}</span></div>
                <div><label>Jurisdiction</label><span>{client.jurisdiction}</span></div>
                <div><label>Industry</label><span>{client.industry}</span></div>
                <div><label>Annual Revenue</label><span>{formatCurrency(client.revenue)}</span></div>
                <div><label>Relationship Owner</label><span>{client.relationshipOwner}</span></div>
                <div><label>Engagement Partner</label><span>{client.partner || 'Daniel James'}</span></div>
              </div>
            </div>

            <div className="panel panel-pad">
              <h3>Custom Bounded Fields</h3>
              <div className="info-grid mt12">
                {client.customFields && Object.entries(client.customFields).map(([id, value]) => (
                  <div key={id}><label>{state.customFields.find(f => f.id === id)?.label || id}</label><span>{String(value)}</span></div>
                ))}
              </div>
              {activeCustomFields.length > 0 && <form className="row mt12" onSubmit={handleSaveCustomField}>
                <select className="input" aria-label="Custom field" value={customFieldId} onChange={event => { setCustomFieldId(event.target.value); setCustomFieldValue(''); }}>
                  {activeCustomFields.map(field => <option key={field.id} value={field.id}>{field.label} · {field.type}</option>)}
                </select>
                {(() => {
                  const field = activeCustomFields.find(item => item.id === customFieldId);
                  if (field?.type === 'choice') return <select className="input" aria-label="Custom field value" value={customFieldValue} onChange={event => setCustomFieldValue(event.target.value)} required><option value="">Choose…</option>{field.options?.map(option => <option key={option}>{option}</option>)}</select>;
                  return <input className="input" aria-label="Custom field value" type={field?.type === 'date' ? 'date' : field?.type === 'number' ? 'number' : 'text'} step={field?.type === 'number' ? 'any' : undefined} value={customFieldValue} onChange={event => setCustomFieldValue(event.target.value)} required />;
                })()}
                <button className="btn sm" type="submit">Save custom value</button>
              </form>}
              <details className="mt12">
                <summary className="caption">Manage bounded custom fields</summary>
                <div className="stack mt8" style={{ gap: 6 }}>
                  {state.customFields.map(field => <div className="row between" key={field.id}>
                    <span>{field.label} · {field.type}{field.enabled === false ? ' · Disabled (saved values retained)' : ''}</span>
                    <button className="btn xs ghost" type="button" onClick={() => {
                      try { prototypeStore.setCustomFieldDefinitionEnabled(field.id, field.enabled === false); setClientNotice(`${field.label} ${field.enabled === false ? 'enabled' : 'disabled'}; saved client values are retained.`); }
                      catch (error) { setClientNotice(error instanceof Error ? error.message : 'Custom field could not be changed.'); }
                    }}>{field.enabled === false ? 'Enable' : 'Disable'}</button>
                  </div>)}
                  <form className="grid2 mt8" onSubmit={event => {
                    event.preventDefault();
                    try {
                      const options = newFieldOptions.split(',').map(item => item.trim()).filter(Boolean);
                      prototypeStore.addCustomFieldDefinition(newFieldLabel, newFieldType, options);
                      setNewFieldLabel(''); setNewFieldOptions('');
                      setClientNotice('Bounded custom field added to the shared client schema.');
                    } catch (error) { setClientNotice(error instanceof Error ? error.message : 'Custom field could not be added.'); }
                  }}>
                    <label className="caption">New field<input className="input mt4" aria-label="New custom field label" value={newFieldLabel} onChange={event => setNewFieldLabel(event.target.value)} required /></label>
                    <label className="caption">Value type<select className="input mt4" aria-label="New custom field type" value={newFieldType} onChange={event => setNewFieldType(event.target.value as CustomFieldDefinition['type'])}><option value="text">Text</option><option value="date">Date</option><option value="number">Number</option><option value="choice">Choice</option></select></label>
                    {newFieldType === 'choice' && <label className="caption" style={{ gridColumn: '1 / -1' }}>Choices (comma separated)<input className="input mt4" aria-label="New custom field choices" value={newFieldOptions} onChange={event => setNewFieldOptions(event.target.value)} required /></label>}
                    <button className="btn sm ghost" type="submit">Add bounded field</button>
                  </form>
                </div>
              </details>
              <div className="row mt12">
                <label className="caption" htmlFor="relationship-group">Non-authorizing relationship group</label>
                <select id="relationship-group" className="input" value={client.relationshipGroupId || ''} onChange={event => {
                  try { prototypeStore.assignClientRelationshipGroup(client.id, event.target.value || undefined); setClientNotice('Relationship group updated. Group membership does not grant client access.'); }
                  catch (error) { setClientNotice(error instanceof Error ? error.message : 'Relationship group could not be updated.'); }
                }}>
                  <option value="">No relationship group</option>
                  {state.relationshipGroups.map(group => <option key={group.id} value={group.id}>{group.name}</option>)}
                </select>
              </div>
              <form className="row mt8" onSubmit={event => {
                event.preventDefault();
                try { prototypeStore.createClientRelationshipGroup(client.id, newGroupName); setNewGroupName(''); setClientNotice('Relationship group created. Group membership does not grant client access.'); }
                catch (error) { setClientNotice(error instanceof Error ? error.message : 'Relationship group could not be created.'); }
              }}>
                <input className="input" aria-label="New relationship group" placeholder="New group name" value={newGroupName} onChange={event => setNewGroupName(event.target.value)} required />
                <button className="btn sm ghost" type="submit">Create group</button>
              </form>
            </div>
          </div>

          <div className="stack" style={{ gap: 16 }}>
            <div className="panel panel-pad">
              <h3>Quick Actions</h3>
              <div className="stack mt12" style={{ gap: 8 }}>
                <button
                  className="btn sm"
                  onClick={() => {
                    prototypeStore.prepareClientWorkspace(client.id);
                  }}
                >
                  <Icon name="folder" /> Prepare SharePoint Workspace
                </button>
                <button
                  className="btn sm"
                  onClick={() => {
                    onNavigate('portal');
                  }}
                >
                  <Icon name="globe" /> Preview Client Portal
                </button>
                <button
                  className="btn sm"
                  onClick={() => {
                    onNavigate('acquisition');
                  }}
                >
                  <Icon name="target" /> View Commercial Pipeline
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Tab 2: Contacts */}
      {activeTab === 'contacts' && (
        <div className="panel">
          <div className="panel-head">
            <h3>Registered Contacts ({contacts.length})</h3>
            <button className="btn primary sm" onClick={() => setShowAddContact(true)}>
              <Icon name="plus" /> Add Contact
            </button>
          </div>
          <div className="tablewrap">
            <table>
              <thead>
                <tr>
                  <th>Name</th>
                  <th>Title</th>
                  <th>Email</th>
                  <th>Phone</th>
                  <th>Role</th>
                  <th>Portal Access</th>
                </tr>
              </thead>
              <tbody>
                {contacts.map(c => (
                  <tr key={c.id} data-search-target={c.id === searchTargetId ? 'true' : undefined} className={c.id === searchTargetId ? 'selected-row' : undefined}>
                    <td><b>{c.name}</b> {c.isPrimary && <span className="tag blue">Primary</span>}</td>
                    <td>{c.title || 'Finance'}</td>
                    <td>{c.email}</td>
                    <td>{c.phone || '—'}</td>
                    <td>Management Contact</td>
                    <td>
                      <span className={`badge ${c.portalAccessRequested ? 'amber' : 'gray'}`}>
                        {c.portalAccessRequested ? 'Request pending' : 'No portal access'}
                      </span>
                      {!c.isPrimary && c.active && <button className="btn xs ghost ml8" onClick={() => prototypeStore.setPrimaryContact(client.id, c.id)}>Make primary</button>}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Tab 3: Engagements */}
      {activeTab === 'engagements' && (
        <div className="panel">
          <div className="panel-head">
            <h3>Active & Historical Engagements</h3>
            <button className="btn primary sm" onClick={() => onNavigate('engagements')}>
              <Icon name="plus" /> New Engagement
            </button>
          </div>
          <div className="tablewrap">
            <table>
              <thead>
                <tr>
                  <th>Engagement ID</th>
                  <th>Service</th>
                  <th>Period</th>
                  <th>Stage</th>
                  <th>Manager</th>
                  <th>Agreed Fee</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {engagements.map(e => (
                  <tr key={e.id}>
                    <td><b>{e.id}</b></td>
                    <td>{e.service}</td>
                    <td>{e.period}</td>
                    <td><span className="badge teal">{e.stage}</span></td>
                    <td>{e.manager}</td>
                    <td>{formatCurrency(e.agreedFee, e.currency)}</td>
                    <td>
                      <button
                        className="btn sm"
                        onClick={() => {
                          prototypeStore.setSelectedEngagement(e.id);
                          onNavigate('engagements');
                        }}
                      >
                        Open
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Tab 4: Jobs */}
      {activeTab === 'jobs' && (
        <div className="panel">
          <div className="panel-head">
            <h3>Jobs & Delivery Containers</h3>
            <button className="btn primary sm" onClick={() => onNavigate('jobs')}>
              <Icon name="plus" /> Go to Jobs
            </button>
          </div>
          <div className="tablewrap">
            <table>
              <thead>
                <tr>
                  <th>Job Title</th>
                  <th>Owner</th>
                  <th>Due Date</th>
                  <th>Status</th>
                  <th>Budget</th>
                </tr>
              </thead>
              <tbody>
                {jobs.map(j => (
                  <tr key={j.id}>
                    <td><b>{j.title}</b><div className="cell-sub">{j.id}</div></td>
                    <td>{j.owner}</td>
                    <td>{j.dueDate}</td>
                    <td><span className="badge gray">{j.status}</span></td>
                    <td>{j.budgetHours ? `${j.budgetHours} hrs` : '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Tab 5: Documents */}
      {activeTab === 'documents' && (
        <div className="panel">
          <div className="panel-head">
            <h3>SharePoint Document Repository</h3>
            <button className="btn sm" onClick={() => onNavigate('documents')}>
              <Icon name="folder" /> Open Document Browser
            </button>
          </div>
          <div className="tablewrap">
            <table>
              <thead>
                <tr>
                  <th>File Name</th>
                  <th>Path</th>
                  <th>Version</th>
                  <th>Classification</th>
                  <th>Uploaded By</th>
                </tr>
              </thead>
              <tbody>
                {documents.map(d => (
                  <tr key={d.id}>
                    <td><b>{d.name}</b></td>
                    <td><span className="mono">{d.folderPath}</span></td>
                    <td>v{d.version}</td>
                    <td><span className="tag gray">{d.classification}</span></td>
                    <td>{d.uploadedBy}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Tab 6: Requests */}
      {activeTab === 'requests' && (
        <div className="panel">
          <div className="panel-head">
            <h3>PBC Information Requests</h3>
            <div className="row" style={{ gap: 10 }}>
              <span className="caption">Total: {pbcRequests.length}</span>
              <button className="btn primary sm" onClick={() => setShowPbcForm(!showPbcForm)}>{showPbcForm ? 'Close request form' : 'New PBC Request'}</button>
            </div>
          </div>
          {requestNotice && <div role="status" className="panel-pad sub">{requestNotice}</div>}
          {showPbcForm && <form className="panel-pad grid2" onSubmit={handleCreatePbc}>
            <div><label className="caption">Engagement</label><select className="input" value={pbcEngagementId} onChange={e => setPbcEngagementId(e.target.value)} required>{engagements.map(e => <option key={e.id} value={e.id}>{e.id} · FY {e.year} · {e.service}</option>)}</select></div>
            <div><label className="caption">Request title</label><input className="input" value={pbcTitle} onChange={e => setPbcTitle(e.target.value)} required /></div>
            <div><label className="caption">Category</label><input className="input" value={pbcCategory} onChange={e => setPbcCategory(e.target.value)} required /></div>
            <div><label className="caption">Due date</label><input type="date" className="input" value={pbcDue} onChange={e => setPbcDue(e.target.value)} required /></div>
            <div><label className="caption">Client recipient</label><input className="input" value={pbcContributor} onChange={e => setPbcContributor(e.target.value)} required /></div>
            <div className="row" style={{ alignItems: 'end' }}><button className="btn primary sm" type="submit">Save Draft Request</button></div>
          </form>}
          <div className="tablewrap">
            <table>
              <thead>
                <tr>
                  <th>Request Title</th>
                  <th>Category</th>
                  <th>Due Date</th>
                  <th>Status</th>
                  <th>Current File</th>
                  <th>History / Actions</th>
                </tr>
              </thead>
              <tbody>
                {pbcRequests.map(p => (
                  <tr key={p.id} data-search-target={p.id === searchTargetId ? 'true' : undefined} className={p.id === searchTargetId ? 'selected-row' : undefined}>
                    <td><b>{p.title}</b><div className="cell-sub">{p.id}</div>{p.clarificationNote && <div className="cell-sub">Clarification: {p.clarificationNote}</div>}</td>
                    <td>{p.category}</td>
                    <td>{p.due}</td>
                    <td><span className={`badge ${p.status === 'Accepted' ? 'green' : p.status === 'Received' ? 'blue' : 'amber'}`}>{p.status}</span></td>
                    <td>{p.file || 'Awaiting upload'}</td>
                    <td>
                      <div className="row" style={{ gap: 6 }}>
                        {p.status === 'Draft' && <button className="btn sm" onClick={() => handlePresentPbc(p.engagementId, p.id)}>Present request</button>}
                        {p.status === 'Received' && <><button className="btn sm" onClick={() => { setClarification({ engagementId: p.engagementId, request: p }); setClarificationText(''); }}>Request clarification</button><button className="btn sm primary" onClick={() => handleAcceptPbc(p.engagementId, p.id)}>Accept response</button></>}
                        {p.thread?.length ? <details><summary className="caption">{p.thread.length} messages</summary>{p.thread.map(message => <div className="cell-sub" key={message.id}>{message.kind}: {message.text}</div>)}</details> : null}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Tab 7: Communications */}
      {activeTab === 'communications' && (
        <div className="panel">
          <div className="panel-head">
            <h3>Client Communications Register</h3>
            <button className="btn primary sm" onClick={() => onNavigate('communications')}>
              <Icon name="message" /> Compose Email / Note
            </button>
          </div>
          <div className="stack panel-pad" style={{ gap: 12 }}>
            {communications.map(c => (
              <div key={c.id} className="borderbox" style={{ padding: 12 }}>
                <div className="between">
                  <b>{c.summary}</b>
                  <span className="tag gray">{c.channel} · {c.direction}</span>
                </div>
                <p className="sub mt8" style={{ whiteSpace: 'pre-line' }}>{c.body}</p>
                <div className="cell-sub mt8">{c.author} · {new Date(c.date).toLocaleDateString('en-GB')}</div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Tab 8: Time */}
      {activeTab === 'time' && (
        <div className="panel panel-pad">
          <h3>Logged Staff Hours</h3>
          <p className="sub" style={{ marginBottom: 12 }}>Total recorded time for this client.</p>
          <div className="metric-grid">
            <div className="metric">
              <span className="metric-label">Approved Minutes</span>
              <div className="metric-val">{times.reduce((s, t) => s + (t.status === 'Approved' ? t.durationMinutes : 0), 0)} min</div>
              <span className="metric-sub">{formatMinutesToHours(times.reduce((s, t) => s + (t.status === 'Approved' ? t.durationMinutes : 0), 0))}</span>
            </div>
          </div>
        </div>
      )}

      {/* Tab 9: Billing */}
      {activeTab === 'billing' && (
        <div className="panel">
          <div className="panel-head">
            <h3>Invoices & Receipts</h3>
            <button className="btn primary sm" onClick={() => onNavigate('billing')}>
              <Icon name="receipt" /> Go to Billing Desk
            </button>
          </div>
          <div className="tablewrap">
            <table>
              <thead>
                <tr>
                  <th>Invoice #</th>
                  <th>Description</th>
                  <th>Amount</th>
                  <th>Paid</th>
                  <th>Status</th>
                  <th>Due Date</th>
                </tr>
              </thead>
              <tbody>
                {invoices.map(inv => (
                  <tr key={inv.id}>
                    <td><b>{inv.invoiceNumber}</b></td>
                    <td>{inv.description}</td>
                    <td>{formatCurrency(inv.amount, inv.currency)}</td>
                    <td>{formatCurrency(inv.paid, inv.currency)}</td>
                    <td><span className={`badge ${inv.status === 'Paid' ? 'green' : 'amber'}`}>{inv.status}</span></td>
                    <td>{inv.due}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Tab 10: Accounting */}
      {activeTab === 'accounting' && (
        <div className="panel panel-pad">
          <h3>Trial Balance & Ledgers</h3>
          <p className="sub" style={{ marginBottom: 16 }}>Imported accounting books for active external audit.</p>
          <button className="btn primary sm" onClick={() => onNavigate('accounting-setup')}>
            <Icon name="calculator" /> Open Accounting Workbench
          </button>
        </div>
      )}

      {/* Tab 11: Audit */}
      {activeTab === 'audit' && (
        <div className="panel">
          <div className="panel-head">
            <h3>Assurance Workpapers ({workpapers.length})</h3>
            <button className="btn primary sm" onClick={() => onNavigate('audit')}>
              <Icon name="checkboard" /> Open Workpaper Desk
            </button>
          </div>
          <div className="tablewrap">
            <table>
              <thead>
                <tr>
                  <th>WP Ref</th>
                  <th>Title</th>
                  <th>Objective</th>
                  <th>Status</th>
                  <th>Reviewer</th>
                </tr>
              </thead>
              <tbody>
                {workpapers.map(w => (
                  <tr key={w.id}>
                    <td><b>{w.id}</b></td>
                    <td>{w.title}</td>
                    <td>{w.objective}</td>
                    <td><span className={`badge ${w.status === 'Cleared' ? 'green' : 'amber'}`}>{w.status}</span></td>
                    <td>{w.reviewer}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Tab 12: Activity */}
      {activeTab === 'activity' && (
        <div className="panel panel-pad">
          <h3>Client Activity & Audit Events</h3>
          <div className="stack mt12" style={{ gap: 8 }}>
            {state.events.filter(e => e.ref.includes(client.id) || engagements.some(engagement => e.ref.includes(engagement.id))).map((ev, i) => (
              <div key={i} className="activity">
                <div className="activity-dot"><Icon name={ev.type} size="sm" /></div>
                <div>
                  <p>{ev.text}</p>
                  <small>{ev.ref} · {ev.time}</small>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Add Contact Modal */}
      {showAddContact && (
        <div className="modal-backdrop" onClick={() => setShowAddContact(false)}>
          <div className="modal" style={{ maxWidth: 440 }} onClick={e => e.stopPropagation()}>
            <div className="modal-head">
              <h2>Add Contact to {client.name}</h2>
              <button className="icon-btn" onClick={() => setShowAddContact(false)}>✕</button>
            </div>
            <form onSubmit={handleAddContact}>
              <div className="modal-body stack" style={{ gap: 12 }}>
                <div>
                  <label className="caption">Full Name</label>
                  <input
                    type="text"
                    className="input"
                    placeholder="e.g. Fatima Al-Kuwari"
                    value={contactName}
                    onChange={e => setContactName(e.target.value)}
                    required
                  />
                </div>
                <div>
                  <label className="caption">Job Title</label>
                  <input
                    type="text"
                    className="input"
                    placeholder="e.g. Finance Controller"
                    value={contactTitle}
                    onChange={e => setContactTitle(e.target.value)}
                  />
                </div>
                <div>
                  <label className="caption">Email Address</label>
                  <input
                    type="email"
                    className="input"
                    placeholder="fatima@client.demo"
                    value={contactEmail}
                    onChange={e => setContactEmail(e.target.value)}
                    required
                  />
                </div>
              </div>
              <div className="modal-foot">
                <button type="button" className="btn ghost sm" onClick={() => setShowAddContact(false)}>
                  Cancel
                </button>
                <button type="submit" className="btn primary sm">
                  Save Contact
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {clarification && <div className="modal-backdrop" onClick={() => setClarification(null)}><div className="modal" onClick={e => e.stopPropagation()}>
        <div className="modal-head"><h2>Request Clarification</h2><button className="icon-btn" onClick={() => setClarification(null)}>✕</button></div>
        <form onSubmit={handleClarification}><div className="modal-body stack" style={{ gap: 10 }}>
          <p className="sub">{clarification.request.title} · {clarification.request.id}. This message is visible to the client in the local portal.</p>
          <label className="caption">Clarification details<textarea className="input" value={clarificationText} onChange={e => setClarificationText(e.target.value)} required /></label>
        </div><div className="modal-foot"><button type="button" className="btn ghost sm" onClick={() => setClarification(null)}>Cancel</button><button type="submit" className="btn primary sm">Send clarification</button></div></form>
      </div></div>}
    </div>
  );
};
