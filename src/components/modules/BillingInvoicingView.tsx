// Module 14: Invoicing, Billing & Credit Notes (VP-030, VP-031)
import React, { useState } from 'react';
import { RouteKey, InvoiceRecord, CreditNoteRecord } from '../../types';
import { prototypeStore } from '../../store/prototypeStore';
import { Icon } from '../common/Icons';
import { formatCurrency } from '../../services/calculations';
import { exportService } from '../../services/exportService';

interface BillingInvoicingViewProps {
  onNavigate: (route: RouteKey) => void;
}

export const BillingInvoicingView: React.FC<BillingInvoicingViewProps> = ({ onNavigate }) => {
  const state = prototypeStore.getSnapshot();
  const [showDraftModal, setShowDraftModal] = useState(false);
  const [selectedTimeSourceIds, setSelectedTimeSourceIds] = useState<string[]>([]);
  const [showCreditModal, setShowCreditModal] = useState(false);
  const [selectedInvoice, setSelectedInvoice] = useState<InvoiceRecord | null>(null);
  const [notice, setNotice] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  // New draft invoice form
  const [invNumber, setInvNumber] = useState(`INV-2600${state.invoices.length + 1}`);
  const [description, setDescription] = useState('Interim audit fee billing - Phase 1 Fieldwork');
  const [amount, setAmount] = useState(200000);
  const [due, setDue] = useState('2026-10-31');

  // Credit note form
  const [creditAmount, setCreditAmount] = useState(25000);
  const [creditReason, setCreditReason] = useState('Commercial fee adjustment approved by partner');

  const invoices = state.invoices;
  const selectedEngagement = state.engagements.find(e => e.id === state.selectedEngagement);
  const client = state.clients.find(c => c.id === selectedEngagement?.client);
  const currency = selectedEngagement?.currency || 'QAR';
  const availableTimeSources = state.times.filter(time =>
    time.status === 'Approved' && time.billable && !time.supersedesId && !time.billedInvoiceId &&
    time.clientId === client?.id && time.engagementId === selectedEngagement?.id &&
    time.currency === selectedEngagement?.currency && Number.isFinite(time.billingRatePerHour) && (time.billingRatePerHour || 0) > 0 &&
    !invoices.some(invoice => invoice.lines.some(line => line.sourceType === 'Time entry' && line.sourceId === time.id))
  );
  const selectedTimeSources = availableTimeSources.filter(time => selectedTimeSourceIds.includes(time.id));
  const sourcedTotal = Math.round(selectedTimeSources.reduce((sum, time) => sum + time.durationMinutes / 60 * (time.billingRatePerHour || 0), 0) * 100) / 100;

  const handleCreateDraft = (e: React.FormEvent) => {
    e.preventDefault();

    const lines = selectedTimeSources.length
      ? selectedTimeSources.map(time => ({
        id: `LINE-${time.id}`,
        description: `${time.date} · ${time.taskTitle} · ${time.person}`,
        quantity: time.durationMinutes / 60,
        rate: time.billingRatePerHour!,
        amount: Math.round(time.durationMinutes / 60 * time.billingRatePerHour! * 100) / 100,
        sourceType: 'Time entry' as const,
        sourceId: time.id
      }))
      : [{ id: `LINE-${Date.now()}`, description, quantity: 1, rate: amount, amount, sourceType: 'Ad hoc' as const }];

    const newInv: InvoiceRecord = {
      id: `INV-${Date.now().toString().slice(-4)}`,
      clientId: client?.id || 'CL-001',
      eng: state.selectedEngagement,
      engagementId: state.selectedEngagement,
      invoiceNumber: invNumber,
      description: selectedTimeSources.length ? `Approved time billing · ${selectedTimeSources.length} entries` : description,
      amount: selectedTimeSources.length ? sourcedTotal : amount,
      paid: 0,
      creditsApplied: 0,
      currency,
      issueDate: new Date().toISOString().split('T')[0],
      due,
      status: 'Draft',
      preparedBy: state.currentPerson,
      lines
    };

    try {
      prototypeStore.addInvoice(newInv);
      setSelectedTimeSourceIds([]);
      setShowDraftModal(false);
    } catch (err: any) {
      setNotice({ type: 'error', text: err.message });
    }
  };

  const handleApprove = (inv: InvoiceRecord) => {
    try {
      prototypeStore.reviewInvoice(inv.id, true);
      setNotice({ type: 'success', text: `Invoice ${inv.invoiceNumber} reviewed and approved.` });
      setTimeout(() => setNotice(null), 4000);
    } catch (err: any) {
      setNotice({ type: 'error', text: err.message });
      setTimeout(() => setNotice(null), 6000);
    }
  };

  const handleIssue = (inv: InvoiceRecord) => {
    prototypeStore.issueInvoice(inv.id);
  };

  const handleCreateCredit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedInvoice) return;

    const newCredit: CreditNoteRecord = {
      id: `CN-${Date.now().toString().slice(-4)}`,
      clientId: selectedInvoice.clientId,
      invoiceId: selectedInvoice.id,
      creditNumber: `CN-2600${state.creditNotes.length + 1}`,
      amount: creditAmount,
      currency: selectedInvoice.currency,
      reason: creditReason,
      status: 'Draft',
      issueDate: state.asOfDate,
      date: new Date().toISOString().split('T')[0],
      preparedBy: state.currentPerson,
      issuedBy: undefined
    };

    try {
      prototypeStore.addCreditNote(newCredit);
      setNotice({ type: 'success', text: `Credit note ${newCredit.creditNumber} saved as a draft for independent review.` });
      setShowCreditModal(false);
      setSelectedInvoice(null);
    } catch (err: any) {
      setNotice({ type: 'error', text: err.message });
    }
  };

  const handleReviewCredit = (creditId: string) => {
    try { prototypeStore.reviewCreditNote(creditId, true); setNotice({ type: 'success', text: 'Credit note approved for issue.' }); }
    catch (err: any) { setNotice({ type: 'error', text: err.message }); }
  };

  const handleIssueCredit = (creditId: string) => {
    try { prototypeStore.issueCreditNote(creditId); setNotice({ type: 'success', text: 'Credit note issued in the local prototype.' }); }
    catch (err: any) { setNotice({ type: 'error', text: err.message }); }
  };

  const handleExportPDF = (inv: InvoiceRecord) => {
    exportService.exportPDF(
      `${inv.invoiceNumber}_Document`,
      `Tax Invoice: ${inv.invoiceNumber}`,
      [
        `Client Legal Name: ${client?.name || 'Example Trading Entity'}`,
        `Client Jurisdiction: ${client?.jurisdiction || 'State of Qatar'}`,
        `Billing Description: ${inv.description}`,
        `Billed Amount: ${formatCurrency(inv.amount, inv.currency)}`,
        `Amount Paid: ${formatCurrency(inv.paid, inv.currency)}`,
        `Balance Outstanding: ${formatCurrency(inv.amount - inv.paid - (inv.creditsApplied || 0), inv.currency)}`,
        `Payment Due Date: ${inv.due}`,
        `Status: ${inv.status}`
      ]
    );
  };

  return (
    <div className="stack" style={{ gap: 20 }}>
      <div className="pagehead">
        <div>
          <h1>Billing, Invoicing & Credit Notes</h1>
          <p>Multi-currency professional fee invoicing, independent approval, and local PDF billing records.</p>
        </div>
        <button className="btn primary sm" onClick={() => setShowDraftModal(true)}>
          <Icon name="plus" /> Draft New Invoice
        </button>
      </div>

      {notice && (
        <div className={`badge ${notice.type === 'error' ? 'danger' : 'success'}`} style={{ padding: '8px 12px', display: 'block', fontSize: 13 }}>
          {notice.text}
        </div>
      )}

      <div className="panel">
        <div className="panel-head">
          <h3>Invoices Register ({invoices.length})</h3>
          <span className="caption">Separation of duties: Preparer cannot approve own invoice</span>
        </div>
        <div className="tablewrap">
          <table>
            <thead>
              <tr>
                <th>Invoice #</th>
                <th>Description</th>
                <th>Amount</th>
                <th>Paid</th>
                <th>Credits</th>
                <th>Outstanding</th>
                <th>Status</th>
                <th>Due Date</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {invoices.map(inv => {
                const outstanding = Math.max(0, inv.amount - inv.paid - (inv.creditsApplied || 0));
                return (
                  <tr key={inv.id}>
                    <td><b>{inv.invoiceNumber}</b></td>
                    <td>{inv.description}</td>
                    <td><b>{formatCurrency(inv.amount, inv.currency)}</b></td>
                    <td>{formatCurrency(inv.paid, inv.currency)}</td>
                    <td>{inv.creditsApplied ? formatCurrency(inv.creditsApplied, inv.currency) : '—'}</td>
                    <td><b>{formatCurrency(outstanding, inv.currency)}</b></td>
                    <td>
                      <span className={`badge ${inv.status === 'Paid' ? 'green' : inv.status === 'Issued' ? 'blue' : 'amber'}`}>
                        {inv.status}
                      </span>
                    </td>
                    <td>{inv.due}</td>
                    <td>
                      <div className="row" style={{ gap: 6 }}>
                        <button
                          className="btn sm"
                          onClick={() => handleExportPDF(inv)}
                          title="Export Demonstration PDF with watermark"
                        >
                          <Icon name="download" size="sm" /> PDF
                        </button>
                        {inv.status === 'Draft' && (
                          <button
                            className="btn sm ghost"
                            onClick={() => handleApprove(inv)}
                          >
                            Approve
                          </button>
                        )}
                        {inv.status === 'Approved' && (
                          <button
                            className="btn sm primary"
                            onClick={() => handleIssue(inv)}
                          >
                            Issue
                          </button>
                        )}
                        {inv.status === 'Issued' && outstanding > 0 && (
                          <button
                            className="btn sm ghost"
                            onClick={() => {
                              setSelectedInvoice(inv);
                              setShowCreditModal(true);
                            }}
                          >
                            Credit Note
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {/* Credit Notes Register */}
      {state.creditNotes.length > 0 && (
        <div className="panel">
          <div className="panel-head">
            <h3>Credit Notes ({state.creditNotes.length})</h3>
          </div>
          <div className="tablewrap">
            <table>
              <thead>
                <tr>
                  <th>Credit Note #</th>
                  <th>Original Invoice</th>
                  <th>Amount</th>
                  <th>Reason</th>
                  <th>Date</th>
                  <th>Status</th>
                  <th>Prepared / Reviewed / Issued</th>
                  <th>Action</th>
                </tr>
              </thead>
              <tbody>
                {state.creditNotes.map(cn => (
                  <tr key={cn.id}>
                    <td><b>{cn.creditNumber}</b></td>
                    <td>{cn.invoiceId}</td>
                    <td><b>{formatCurrency(cn.amount, cn.currency)}</b></td>
                    <td>{cn.reason}</td>
                    <td>{cn.date}</td>
                    <td>{cn.status}</td>
                    <td>{[cn.preparedBy, cn.reviewedBy, cn.issuedBy].filter(Boolean).join(' / ') || '—'}</td>
                    <td>
                      {cn.status === 'Draft' && <button className="btn sm" onClick={() => handleReviewCredit(cn.id)}>Approve</button>}
                      {cn.status === 'Approved' && <button className="btn sm primary" onClick={() => handleIssueCredit(cn.id)}>Issue</button>}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Draft Modal */}
      {showDraftModal && (
        <div className="modal-backdrop" onClick={() => setShowDraftModal(false)}>
          <div className="modal" style={{ maxWidth: 480 }} onClick={e => e.stopPropagation()}>
            <div className="modal-head">
              <h2>Draft Fee Invoice</h2>
              <button className="icon-btn" onClick={() => setShowDraftModal(false)}>✕</button>
            </div>
            <form onSubmit={handleCreateDraft}>
              <div className="modal-body stack" style={{ gap: 12 }}>
                <fieldset className="stack" style={{ gap: 8, border: '1px solid var(--border)', borderRadius: 8, padding: 12 }}>
                  <legend className="caption">Approved billable time (optional)</legend>
                  {availableTimeSources.length === 0 ? <div className="caption">No unbilled approved time with a pinned rate for this engagement.</div> : availableTimeSources.map(time => (
                    <label key={time.id} className="row" style={{ justifyContent: 'space-between', gap: 10 }}>
                      <span><input type="checkbox" checked={selectedTimeSourceIds.includes(time.id)} onChange={e => setSelectedTimeSourceIds(ids => e.target.checked ? [...ids, time.id] : ids.filter(id => id !== time.id))} /> {time.date} · {time.taskTitle} · {time.person}</span>
                      <b>{formatCurrency(time.durationMinutes / 60 * (time.billingRatePerHour || 0), time.currency || 'QAR')}</b>
                    </label>
                  ))}
                  {selectedTimeSources.length > 0 && <div className="caption">Selected sources will be reserved by this draft and cannot be billed twice. Total: <b>{formatCurrency(sourcedTotal, selectedTimeSources[0].currency || 'QAR')}</b></div>}
                </fieldset>
                <div className="grid2">
                  <div>
                    <label className="caption">Invoice Number</label>
                    <input
                      type="text"
                      className="input"
                      value={invNumber}
                      onChange={e => setInvNumber(e.target.value)}
                      required
                    />
                  </div>
                  <div>
                    <label className="caption">Payment Due Date</label>
                    <input
                      type="date"
                      className="input"
                      value={due}
                      onChange={e => setDue(e.target.value)}
                      required
                    />
                  </div>
                </div>
                <div>
                  <label className="caption">Fee Description</label>
                  <input
                    type="text"
                    className="input"
                    value={description}
                    onChange={e => setDescription(e.target.value)}
                    required
                  />
                </div>
                <div>
                  <label className="caption">Invoice Amount ({currency})</label>
                  <input
                    type="number"
                    className="input"
                    value={selectedTimeSources.length ? sourcedTotal : amount}
                    onChange={e => setAmount(Number(e.target.value))}
                    readOnly={selectedTimeSources.length > 0}
                    required
                  />
                </div>
              </div>
              <div className="modal-foot">
                <button type="button" className="btn ghost sm" onClick={() => setShowDraftModal(false)}>Cancel</button>
                <button type="submit" className="btn primary sm">Create Draft</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Credit Note Modal */}
      {showCreditModal && selectedInvoice && (
        <div className="modal-backdrop" onClick={() => setShowCreditModal(false)}>
          <div className="modal" style={{ maxWidth: 460 }} onClick={e => e.stopPropagation()}>
            <div className="modal-head">
              <h2>Draft Credit Note for {selectedInvoice.invoiceNumber}</h2>
              <button className="icon-btn" onClick={() => setShowCreditModal(false)}>✕</button>
            </div>
            <form onSubmit={handleCreateCredit}>
              <div className="modal-body stack" style={{ gap: 12 }}>
                <div>
                  <label className="caption">Original Invoice Total</label>
                  <div><b>{formatCurrency(selectedInvoice.amount, selectedInvoice.currency)}</b></div>
                </div>
                <div>
                  <label className="caption">Credit Amount ({selectedInvoice.currency})</label>
                  <input
                    type="number"
                    max={selectedInvoice.amount - selectedInvoice.paid}
                    className="input"
                    value={creditAmount}
                    onChange={e => setCreditAmount(Number(e.target.value))}
                    required
                  />
                </div>
                <div>
                  <label className="caption">Commercial Justification</label>
                  <textarea
                    className="input"
                    rows={3}
                    value={creditReason}
                    onChange={e => setCreditReason(e.target.value)}
                    required
                  />
                </div>
              </div>
              <div className="modal-foot">
                <button type="button" className="btn ghost sm" onClick={() => setShowCreditModal(false)}>Cancel</button>
                <button type="submit" className="btn primary sm">Create Draft Credit Note</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
