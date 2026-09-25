// Module 11: Team & Client Communications & Email Simulator (VP-026, VP-027)
import React, { useEffect, useRef, useState } from 'react';
import { RouteKey, CommunicationItem, EmailTemplateItem } from '../../types';
import { prototypeStore } from '../../store/prototypeStore';
import { Icon } from '../common/Icons';
import { UnsavedFormGuard } from '../../services/unsavedFormGuard';

interface CommunicationsViewProps {
  onNavigate: (route: RouteKey) => void;
  onRegisterUnsavedForm?: (guard: UnsavedFormGuard | null, key?: string) => void;
}

export const CommunicationsView: React.FC<CommunicationsViewProps> = ({ onNavigate, onRegisterUnsavedForm }) => {
  const state = prototypeStore.getSnapshot();
  const [showComposeModal, setShowComposeModal] = useState(false);
  const [showLogNoteModal, setShowLogNoteModal] = useState(false);
  const [emailError, setEmailError] = useState('');
  const [noteError, setNoteError] = useState('');

  // Email form
  const [recipientEmail, setRecipientEmail] = useState('omar.nasser@example-trading.demo');
  const [selectedTemplateId, setSelectedTemplateId] = useState<string>('TPL-EM-01');
  const [subject, setSubject] = useState('AuditSphere: Document Request for Example Trading Entity');
  const [emailBody, setEmailBody] = useState(
    'Dear Omar,\n\nPlease access your client portal to review the outstanding year-end trial balance request.\n\nThank you,\nSTE Audit Team'
  );
  const [simulationOutcome, setSimulationOutcome] = useState<'Simulated accepted' | 'Simulated failed' | 'Outcome unknown'>('Simulated accepted');
  const emailAttemptRecorded = useRef(false);
  const emailSubmissionId = useRef<string>(crypto.randomUUID());

  // Log note form
  const [channel, setChannel] = useState<CommunicationItem['channel']>('Phone');
  const [participants, setParticipants] = useState('Omar Nasser (CFO), Layla Rahman (Manager)');
  const [noteSummary, setNoteSummary] = useState('');
  const [noteBody, setNoteBody] = useState('');
  const [relatedJobId, setRelatedJobId] = useState('');

  const communications = state.communications;
  const selectedEngagement = state.engagements.find(engagement => engagement.id === state.selectedEngagement);
  const client = state.clients.find(item => item.id === selectedEngagement?.client) || state.clients[0];
  const clientJobs = state.jobs.filter(job => job.clientId === client?.id);
  const relatedJob = clientJobs.find(job => job.id === relatedJobId);

  const saveEmailDraft = (submissionId = emailSubmissionId.current) => {
    // One accepted submission per open compose draft. A deliberate new manual
    // attempt requires closing and reopening the composer.
    if (emailAttemptRecorded.current) return true;
    emailAttemptRecorded.current = true;
    try {
      prototypeStore.addCommunication({ id: `COMM-${crypto.randomUUID()}`, clientId: client?.id || 'CL-001', engagementId: state.selectedEngagement, direction: 'Outbound', channel: 'Email', participants: `${state.currentPerson} -> ${recipientEmail.trim().toLowerCase()}`, recipientEmail: recipientEmail.trim().toLowerCase(), summary: subject, body: emailBody, author: state.currentPerson, date: new Date().toISOString(), visibility: 'Client visible', status: simulationOutcome, simulationReference: `MAIL-SIM-${crypto.randomUUID()}`, simulationEvidence: `Local simulation recorded ${simulationOutcome}; no provider receipt or external delivery confirmation exists.`, simulationSubmissionId: submissionId });
      emailBaseline.current = { recipientEmail, selectedTemplateId, subject, emailBody, simulationOutcome };
      setEmailError(''); setShowComposeModal(false); return true;
    } catch (error) { emailAttemptRecorded.current = false; setEmailError(error instanceof Error ? error.message : 'Simulated email could not be recorded.'); return false; }
  };
  const saveNoteDraft = () => {
    if (!noteSummary.trim()) return false;
    try {
      prototypeStore.addCommunication({ id: `COMM-${Date.now().toString().slice(-4)}`, clientId: client?.id || 'CL-001', engagementId: relatedJob?.engagementId || state.selectedEngagement, jobId: relatedJob?.id, direction: 'Inbound', channel, participants, summary: noteSummary, body: noteBody, author: state.currentPerson, date: new Date().toISOString(), visibility: 'Internal', status: 'Recorded manually' });
      noteBaseline.current = { channel, participants, noteSummary: '', noteBody: '', relatedJobId: '' };
      setNoteError(''); setShowLogNoteModal(false); setNoteSummary(''); setNoteBody(''); setRelatedJobId(''); return true;
    } catch (error) { setNoteError(error instanceof Error ? error.message : 'Communication note could not be saved.'); return false; }
  };
  const emailBaseline = useRef({ recipientEmail, selectedTemplateId, subject, emailBody, simulationOutcome });
  const noteBaseline = useRef({ channel, participants, noteSummary, noteBody, relatedJobId });
  useEffect(() => {
    if (!onRegisterUnsavedForm) return;
    const sameEmail = () => recipientEmail === emailBaseline.current.recipientEmail && selectedTemplateId === emailBaseline.current.selectedTemplateId && subject === emailBaseline.current.subject && emailBody === emailBaseline.current.emailBody && simulationOutcome === emailBaseline.current.simulationOutcome;
    const sameNote = () => channel === noteBaseline.current.channel && participants === noteBaseline.current.participants && noteSummary === noteBaseline.current.noteSummary && noteBody === noteBaseline.current.noteBody && relatedJobId === noteBaseline.current.relatedJobId;
    const discardEmail = () => { setShowComposeModal(false); setRecipientEmail(emailBaseline.current.recipientEmail); setSelectedTemplateId(emailBaseline.current.selectedTemplateId); setSubject(emailBaseline.current.subject); setEmailBody(emailBaseline.current.emailBody); setSimulationOutcome(emailBaseline.current.simulationOutcome); };
    const discardNote = () => { setShowLogNoteModal(false); setChannel(noteBaseline.current.channel); setParticipants(noteBaseline.current.participants); setNoteSummary(''); setNoteBody(''); setRelatedJobId(''); };
    onRegisterUnsavedForm({ label: 'simulated email draft', isDirty: () => showComposeModal && !sameEmail(), save: saveEmailDraft, discard: discardEmail }, 'communications-email-draft');
    onRegisterUnsavedForm({ label: 'communication note draft', isDirty: () => showLogNoteModal && !sameNote(), save: saveNoteDraft, discard: discardNote }, 'communications-note-draft');
    return () => { onRegisterUnsavedForm(null, 'communications-email-draft'); onRegisterUnsavedForm(null, 'communications-note-draft'); };
  }, [showComposeModal, showLogNoteModal, recipientEmail, selectedTemplateId, subject, emailBody, simulationOutcome, channel, participants, noteSummary, noteBody, relatedJobId, onRegisterUnsavedForm]);

  const handleSendEmail = (e: React.FormEvent) => {
    e.preventDefault();
    const form = e.currentTarget as HTMLFormElement;
    if (form.dataset.attemptRecorded === 'true') return;
    form.dataset.attemptRecorded = 'true';
    if (!saveEmailDraft(form.dataset.submissionId || emailSubmissionId.current)) delete form.dataset.attemptRecorded;
  };

  const handleLogNote = (e: React.FormEvent) => {
    e.preventDefault();
    saveNoteDraft();
  };

  const handleTemplateSelect = (tplId: string) => {
    setSelectedTemplateId(tplId);
    const tpl = state.emailTemplates.find(t => t.id === tplId);
    if (tpl) {
      setSubject(tpl.subject.replace('{client_name}', client?.name || 'Client'));
      setEmailBody(
        tpl.body
          .replace('{client_contact}', client?.contact || 'Management')
          .replace('{client_name}', client?.name || 'Client')
          .replace('{request_title}', 'Bank Statements and Reconciliations')
          .replace('{due_date}', '23 Sep 2026')
      );
    }
  };

  return (
    <div className="stack" style={{ gap: 20 }}>
      <div className="pagehead">
        <div>
          <h1>Communications & Email Simulation</h1>
          <p>Microsoft 365 synthetic mail sender, delivery simulation outcomes, and client contact log.</p>
        </div>
        <div className="row" style={{ gap: 10 }}>
          <button className="btn sm ghost" onClick={() => { setNoteError(''); setShowLogNoteModal(true); }}>
            <Icon name="message" /> Log Call / Meeting Note
          </button>
          <button className="btn primary sm" onClick={() => { emailAttemptRecorded.current = false; emailSubmissionId.current = crypto.randomUUID(); setEmailError(''); setShowComposeModal(true); }}>
            <Icon name="message" /> Compose Simulated Email
          </button>
        </div>
      </div>

      <div className="panel">
        <div className="panel-head">
          <h3>Communications Register ({communications.length})</h3>
          <span className="caption">Inbound Calls, Meetings & Outbound Notifications</span>
        </div>
        <div className="stack panel-pad" style={{ gap: 12 }}>
          {communications.map(comm => (
            <div key={comm.id} className="borderbox" style={{ padding: 16 }}>
              <div className="between">
                <div className="row" style={{ gap: 10 }}>
                  <Icon name={comm.channel === 'Email' ? 'message' : 'users'} />
                  <div>
                    <b>{comm.summary}</b>
                    <div className="cell-sub">{comm.participants}</div>
                  </div>
                </div>
                <div className="row" style={{ gap: 8 }}>
                  <span className={`tag ${comm.direction === 'Outbound' ? 'blue' : 'gray'}`}>
                    {comm.direction} · {comm.channel}
                  </span>
                  <span className={`badge ${comm.status === 'Simulated accepted' ? 'green' : 'amber'}`}>
                    {comm.status}
                  </span>
                </div>
              </div>
              {comm.body && (
                <div className="sub mt12" style={{ whiteSpace: 'pre-line', fontSize: 13, background: '#f8fafc', padding: 10, borderRadius: 4 }}>
                  {comm.body}
                </div>
              )}
              {comm.simulationReference && <div className="cell-sub mt8">Simulation evidence · {comm.simulationReference} · {comm.simulationEvidence}</div>}
              {comm.jobId && <div className="cell-sub mt8">Linked job · {state.jobs.find(job => job.id === comm.jobId)?.title || comm.jobId}</div>}
              <div className="cell-sub mt8">
                Recorded by {comm.author} · {new Date(comm.date).toLocaleDateString('en-GB')}
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Compose Email Modal */}
      {showComposeModal && (
        <div className="modal-backdrop" onClick={() => setShowComposeModal(false)}>
          <div className="modal" style={{ maxWidth: 540 }} onClick={e => e.stopPropagation()}>
            <div className="modal-head">
              <h2>Compose Simulated Microsoft Email</h2>
              <button className="icon-btn" onClick={() => setShowComposeModal(false)}>✕</button>
            </div>
            <form data-submission-id={emailSubmissionId.current} onSubmit={handleSendEmail}>
              <div className="modal-body stack" style={{ gap: 12 }}>
                <div className="borderbox" style={{ background: '#f1f5f9', padding: 10, fontSize: 12 }}>
                  Sender: <code>{state.m365Config.mailSenderAccount}</code> (Microsoft 365 Exchange Online)
                </div>
                <div>
                  <label className="caption">Email Template</label>
                  <select
                    className="input"
                    value={selectedTemplateId}
                    onChange={e => handleTemplateSelect(e.target.value)}
                  >
                    {state.emailTemplates.map(t => (
                      <option key={t.id} value={t.id}>{t.name}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="caption">To Recipient</label>
                  <input
                    type="email"
                    className="input"
                    aria-label="Email recipient"
                    value={recipientEmail}
                    onChange={e => { setRecipientEmail(e.target.value); setEmailError(''); }}
                    required
                  />
                </div>
                <div>
                  <label className="caption">Subject</label>
                  <input
                    type="text"
                    className="input"
                    value={subject}
                    onChange={e => setSubject(e.target.value)}
                    required
                  />
                </div>
                <div>
                  <label className="caption">Body</label>
                  <textarea
                    className="input"
                    rows={5}
                    value={emailBody}
                    onChange={e => setEmailBody(e.target.value)}
                    required
                  />
                </div>
                <div>
                  <label className="caption">Simulated Delivery Outcome</label>
                  <select
                    className="input"
                    value={simulationOutcome}
                    onChange={e => setSimulationOutcome(e.target.value as any)}
                  >
                    <option value="Simulated accepted">Simulated accepted (delivery not verified)</option>
                    <option value="Simulated failed">Simulated failed (Mailbox full / bounce)</option>
                    <option value="Outcome unknown">Outcome unknown (Pending queue)</option>
                  </select>
                </div>
                <p className="caption">One submission records one manual simulation attempt. To intentionally record another attempt, close and reopen this form; an unknown outcome is never retried automatically. No message is sent or externally confirmed.</p>
                {emailError && <div className="badge red" role="alert">{emailError}</div>}
              </div>
              <div className="modal-foot">
                <button type="button" className="btn ghost sm" onClick={() => setShowComposeModal(false)}>Cancel</button>
                <button type="submit" className="btn primary sm">Simulate Send</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Log Call/Meeting Modal */}
      {showLogNoteModal && (
        <div className="modal-backdrop" onClick={() => setShowLogNoteModal(false)}>
          <div className="modal" style={{ maxWidth: 480 }} onClick={e => e.stopPropagation()}>
            <div className="modal-head">
              <h2>Log Inbound Call or Meeting Note</h2>
              <button className="icon-btn" onClick={() => setShowLogNoteModal(false)}>✕</button>
            </div>
            {noteError && <p role="alert" className="sub">{noteError}</p>}
            <form onSubmit={handleLogNote}>
              <div className="modal-body stack" style={{ gap: 12 }}>
                <div className="grid2">
                  <div>
                    <label className="caption">Channel</label>
                    <select
                      className="input"
                      value={channel}
                      onChange={e => setChannel(e.target.value as any)}
                    >
                      <option value="Phone">Phone Call</option>
                      <option value="Meeting">In-Person / Teams Meeting</option>
                      <option value="Portal message">Portal Message</option>
                    </select>
                  </div>
                  <div>
                    <label className="caption">Participants</label>
                    <input
                      type="text"
                      className="input"
                      value={participants}
                      onChange={e => setParticipants(e.target.value)}
                    />
                  </div>
                </div>
                <label className="caption">Related job (optional)<select className="input mt4" value={relatedJobId} onChange={e => setRelatedJobId(e.target.value)}><option value="">No job link</option>{clientJobs.map(job => <option key={job.id} value={job.id}>{job.title}</option>)}</select></label>
                <div>
                  <label className="caption">Summary Header</label>
                  <input
                    type="text"
                    className="input"
                    value={noteSummary}
                    onChange={e => setNoteSummary(e.target.value)}
                    placeholder="e.g. Discussed audit clearance timeline"
                    required
                  />
                </div>
                <div>
                  <label className="caption">Discussion Notes</label>
                  <textarea
                    className="input"
                    rows={4}
                    value={noteBody}
                    onChange={e => setNoteBody(e.target.value)}
                    placeholder="Record significant discussion points, commitments and agreements..."
                  />
                </div>
              </div>
              <div className="modal-foot">
                <button type="button" className="btn ghost sm" onClick={() => setShowLogNoteModal(false)}>Cancel</button>
                <button type="submit" className="btn primary sm">Save Note</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
