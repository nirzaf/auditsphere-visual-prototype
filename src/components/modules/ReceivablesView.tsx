// Module 15: Receivables Aging & Offline Receipts Allocation (VP-032, VP-033)
import React, { useState } from 'react';
import { RouteKey, ReceiptRecord, InvoiceRecord } from '../../types';
import { prototypeStore } from '../../store/prototypeStore';
import { Icon } from '../common/Icons';
import { calculateReceivablesAging, formatCurrency } from '../../services/calculations';
import { exportService } from '../../services/exportService';
import { visibleClientIds } from '../../services/guards';

interface ReceivablesViewProps {
  onNavigate: (route: RouteKey) => void;
}

export const ReceivablesView: React.FC<ReceivablesViewProps> = ({ onNavigate }) => {
  const state = prototypeStore.getSnapshot();
  const allowedClientIds = visibleClientIds(state);
  const scopedClients = state.clients.filter(c => allowedClientIds === 'ALL' || allowedClientIds.includes(c.id));
  const currencies = Array.from(new Set([
    ...state.invoices.filter(i => allowedClientIds === 'ALL' || allowedClientIds.includes(i.clientId)).map(i => i.currency),
    ...state.receipts.filter(r => allowedClientIds === 'ALL' || allowedClientIds.includes(r.clientId)).map(r => r.currency)
  ])).sort();
  const [clientFilter, setClientFilter] = useState('ALL');
  const [currencyFilter, setCurrencyFilter] = useState(currencies[0] || 'QAR');
  const [asOfDate, setAsOfDate] = useState(state.asOfDate || '2026-09-23');
  const [showReceiptModal, setShowReceiptModal] = useState(false);
  const [showAllocateModal, setShowAllocateModal] = useState(false);
  const [selectedReceipt, setSelectedReceipt] = useState<ReceiptRecord | null>(null);
  const [notice, setNotice] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  // New receipt form
  const [receiptNumber, setReceiptNumber] = useState(`RCP-2600${state.receipts.length + 1}`);
  const [receiptAmount, setReceiptAmount] = useState(150000);
  const [method, setMethod] = useState<ReceiptRecord['method']>('Bank transfer');
  const [reference, setReference] = useState('TX-QNB-998822');

  // Allocation form
  const [targetInvoiceId, setTargetInvoiceId] = useState<string>('');
  const [allocateAmount, setAllocateAmount] = useState<number>(0);

  const client = scopedClients.find(c => c.id === clientFilter) || scopedClients[0];
  const invoices = state.invoices.filter(i =>
    (allowedClientIds === 'ALL' || allowedClientIds.includes(i.clientId)) &&
    (clientFilter === 'ALL' || i.clientId === clientFilter) && i.currency === currencyFilter && (i.issueDate || i.due) <= asOfDate
  );
  const receiptLedger = state.receipts.filter(r =>
    (allowedClientIds === 'ALL' || allowedClientIds.includes(r.clientId)) &&
    (clientFilter === 'ALL' || r.clientId === clientFilter) && r.currency === currencyFilter
  );
  const receipts = receiptLedger.filter(r => r.date <= asOfDate);
  const credits = state.creditNotes.filter(c =>
    (allowedClientIds === 'ALL' || allowedClientIds.includes(c.clientId)) &&
    (clientFilter === 'ALL' || c.clientId === clientFilter) && (c.currency || invoices.find(i => i.id === c.invoiceId)?.currency) === currencyFilter
  );

  const aging = calculateReceivablesAging(invoices, credits, receiptLedger, asOfDate, clientFilter === 'ALL' ? undefined : clientFilter);
  const invoicePaymentsAsOf = (invoice: InvoiceRecord) => {
    const ledger = receiptLedger.flatMap(rec => rec.allocations
      .filter(allocation => allocation.invoiceId === invoice.id)
      .map(allocation => ({ allocation, receiptDate: rec.date })));
    if (!ledger.length) return invoice.paid;
    return ledger.filter(({ allocation, receiptDate }) => {
      const allocatedDate = (allocation.date || allocation.allocatedAt || receiptDate).slice(0, 10);
      return allocatedDate <= asOfDate && (!allocation.reversed || !allocation.reversalDate || allocation.reversalDate > asOfDate);
    }).reduce((sum, item) => sum + item.allocation.amount, 0);
  };
  const statementInvoices = clientFilter === 'ALL' ? [] : invoices.filter(inv => inv.clientId === client?.id && (inv.status === 'Issued' || inv.status === 'Paid') && (inv.issueDate || inv.due) <= asOfDate);
  const statementCredits = clientFilter === 'ALL' ? [] : credits.filter(credit => credit.clientId === client?.id && credit.status === 'Issued' && credit.issueDate <= asOfDate);
  const statementReceipts = clientFilter === 'ALL' ? [] : receipts.filter(rec => rec.clientId === client?.id && rec.date <= asOfDate);
  const statementRows = [
    ['Document No', 'Date', 'Type', 'Currency', 'Billed Amount', 'Paid / Allocated', 'Balance'],
    ...statementInvoices.map(inv => {
      const paid = invoicePaymentsAsOf(inv);
      return [inv.invoiceNumber, inv.issueDate || inv.due || '', 'Invoice', inv.currency, inv.amount.toString(), paid.toString(), (inv.amount - paid).toString()];
    }),
    ...statementCredits.map(credit => [credit.creditNumber, credit.issueDate, 'Credit note', credit.currency || currencyFilter, String(-credit.amount), '0', String(-credit.amount)]),
    ...statementReceipts.map(rec => {
      const allocated = rec.allocations.filter(allocation => {
        const allocatedDate = (allocation.date || allocation.allocatedAt || rec.date).slice(0, 10);
        return allocatedDate <= asOfDate && (!allocation.reversed || !allocation.reversalDate || allocation.reversalDate > asOfDate);
      }).reduce((sum, allocation) => sum + allocation.amount, 0);
      return [rec.receiptNumber, rec.date, 'Receipt', rec.currency, `-${rec.amount}`, allocated.toString(), (rec.amount - allocated).toString()];
    })
  ];

  const handleAddReceipt = (e: React.FormEvent) => {
    e.preventDefault();

    const newRec: ReceiptRecord = {
      id: `RCP-${Date.now().toString().slice(-4)}`,
      clientId: client?.id || 'CL-001',
      receiptNumber,
      amount: receiptAmount,
      allocatedAmount: 0,
      currency: currencyFilter,
      date: new Date().toISOString().split('T')[0],
      method,
      reference,
      externalRef: reference,
      allocations: []
    };

    prototypeStore.addReceipt(newRec);
    setShowReceiptModal(false);
  };

  const handleAllocate = (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedReceipt || !targetInvoiceId || allocateAmount <= 0) return;

    try {
      prototypeStore.allocateReceipt(selectedReceipt.id, targetInvoiceId, allocateAmount);
      setShowAllocateModal(false);
      setSelectedReceipt(null);
      setNotice({ type: 'success', text: `Allocated ${formatCurrency(allocateAmount, selectedReceipt.currency)} to invoice ${targetInvoiceId}.` });
      setTimeout(() => setNotice(null), 4000);
    } catch (err: any) {
      setNotice({ type: 'error', text: err.message });
      setTimeout(() => setNotice(null), 6000);
    }
  };

  const handleReverse = (receipt: ReceiptRecord, index: number) => {
    const reason = prompt('Please enter the reason for allocation reversal:');
    if (!reason) return;
    prototypeStore.reverseAllocation(receipt.id, index, reason);
  };

  const handleExportStatementCSV = () => {
    if (clientFilter === 'ALL') return;
    exportService.exportCSV(`Client_Statement_${client?.id}_${asOfDate}`, statementRows);
  };

  return (
    <div className="stack" style={{ gap: 20 }}>
      <div className="pagehead">
        <div>
          <h1>Accounts Receivable Aging & Receipts</h1>
          <p>Deterministic 30-day aging buckets, offline manual cash receipts, and audit trail reversals.</p>
          <div className="row mt12" style={{ gap: 10, flexWrap: 'wrap' }}>
            <label className="caption">Client
              <select className="input" aria-label="Receivables client" value={clientFilter} onChange={e => setClientFilter(e.target.value)}>
                <option value="ALL">All permitted clients</option>
                {scopedClients.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select>
            </label>
            <label className="caption">Currency
              <select className="input" aria-label="Receivables currency" value={currencyFilter} onChange={e => setCurrencyFilter(e.target.value)}>
                {currencies.map(currency => <option key={currency} value={currency}>{currency}</option>)}
              </select>
            </label>
            <label className="caption">As of
              <input className="input" aria-label="Receivables as of date" type="date" value={asOfDate} onChange={e => setAsOfDate(e.target.value)} />
            </label>
          </div>
        </div>
        <div className="row" style={{ gap: 10 }}>
          <button className="btn sm ghost" onClick={handleExportStatementCSV} disabled={clientFilter === 'ALL'} title={clientFilter === 'ALL' ? 'Select one client to export a statement.' : undefined}>
            <Icon name="download" /> Export Statement CSV
          </button>
          <button className="btn sm ghost" onClick={() => window.print()} disabled={clientFilter === 'ALL'} title={clientFilter === 'ALL' ? 'Select one client to print a statement.' : undefined}>
            Print Statement
          </button>
          <button className="btn primary sm" onClick={() => setShowReceiptModal(true)} disabled={clientFilter === 'ALL'} title={clientFilter === 'ALL' ? 'Select one client to record a receipt.' : undefined}>
            <Icon name="plus" /> Record Offline Receipt
          </button>
        </div>
      </div>

      {notice && (
        <div className={`badge ${notice.type === 'error' ? 'danger' : 'success'}`} style={{ padding: '8px 12px', display: 'block', fontSize: 13 }}>
          {notice.text}
        </div>
      )}

      <div className="panel panel-pad receivables-statement">
        <div className="panel-head">
          <div>
            <h3>Client Account Statement</h3>
            {clientFilter !== 'ALL' && <span className="caption">{client?.name} · {currencyFilter} · As of {asOfDate}</span>}
          </div>
          {clientFilter === 'ALL' && <span className="caption">Select one permitted client to view or print a statement.</span>}
        </div>
        {clientFilter !== 'ALL' && <div className="tablewrap"><table>
          <thead><tr>{statementRows[0].map(header => <th key={header}>{header}</th>)}</tr></thead>
          <tbody>{statementRows.slice(1).map((row, i) => <tr key={`${row[0]}-${i}`}>{row.map((value, col) => <td key={col}>{value}</td>)}</tr>)}</tbody>
        </table></div>}
      </div>

      {/* Aging Metric Cards */}
      <div className="metric-grid">
        <div className="metric">
          <span className="metric-label">Current (&lt; 30d)</span>
          <div className="metric-val">{formatCurrency(aging.current, currencyFilter)}</div>
          <span className="metric-sub">Within standard credit terms</span>
        </div>
        <div className="metric blue">
          <span className="metric-label">31 – 60 Days</span>
          <div className="metric-val">{formatCurrency(aging.days31to60, currencyFilter)}</div>
          <span className="metric-sub">Follow-up due</span>
        </div>
        <div className="metric amber">
          <span className="metric-label">61 – 90 Days</span>
          <div className="metric-val">{formatCurrency(aging.days61to90, currencyFilter)}</div>
          <span className="metric-sub">Management attention</span>
        </div>
        <div className="metric purple">
          <span className="metric-label">90+ Days (Overdue)</span>
          <div className="metric-val">{formatCurrency(aging.olderThan90, currencyFilter)}</div>
          <span className="metric-sub">Total Overdue: {formatCurrency(aging.totalOverdue, currencyFilter)}</span>
        </div>
      </div>

      {/* Receipts Register */}
      <div className="panel">
        <div className="panel-head">
          <h3>Offline Bank Receipts ({receipts.length})</h3>
          <span className="caption">Manual Wire / Cheque Reconciliations</span>
        </div>
        <div className="tablewrap">
          <table>
            <thead>
              <tr>
                <th>Receipt #</th>
                <th>Method</th>
                <th>Bank Reference</th>
                <th>Date</th>
                <th>Total Received</th>
                <th>Allocated</th>
                <th>Unallocated Balance</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {receipts.map(r => {
                const unallocated = r.amount - r.allocatedAmount;
                return (
                  <tr key={r.id}>
                    <td><b>{r.receiptNumber}</b></td>
                    <td>{r.method}</td>
                    <td><span className="mono">{r.reference}</span></td>
                    <td>{r.date}</td>
                    <td><b>{formatCurrency(r.amount, r.currency)}</b></td>
                    <td>{formatCurrency(r.allocatedAmount, r.currency)}</td>
                    <td>
                      <b style={{ color: unallocated > 0 ? 'var(--blue)' : 'var(--text)' }}>
                        {formatCurrency(unallocated, r.currency)}
                      </b>
                    </td>
                    <td>
                      {unallocated > 0 && (
                        <button
                          className="btn sm primary"
                          onClick={() => {
                            setSelectedReceipt(r);
                            setAllocateAmount(unallocated);
                            const unpaid = invoices.find(i => i.paid < i.amount);
                            if (unpaid) setTargetInvoiceId(unpaid.id);
                            setShowAllocateModal(true);
                          }}
                        >
                          Allocate to Invoice
                        </button>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {/* Allocations History */}
      <div className="panel panel-pad">
        <h3>Receipt Allocations & Audit Trail</h3>
        <div className="stack mt12" style={{ gap: 8 }}>
          {receipts.flatMap(r => r.allocations.map((a, idx) => ({ ...a, receipt: r, index: idx }))).map(item => {
            const inv = invoices.find(i => i.id === item.invoiceId);
            return (
              <div key={`${item.receipt.id}-${item.index}`} className="between borderbox" style={{ padding: 10 }}>
                <div>
                  <b>{item.receipt.receiptNumber}</b> allocated <b>{formatCurrency(item.amount)}</b> to <b>{inv?.invoiceNumber || item.invoiceId}</b>
                  <div className="cell-sub">
                    {new Date(item.allocatedAt).toLocaleString('en-GB')}
                    {item.reversed && <span style={{ color: 'red', marginLeft: 8 }}>(Reversed: {item.reversalReason})</span>}
                  </div>
                </div>
                {!item.reversed && (
                  <button
                    className="btn sm ghost"
                    onClick={() => handleReverse(item.receipt, item.index)}
                  >
                    Reverse Allocation
                  </button>
                )}
              </div>
            );
          })}
        </div>
      </div>

      {/* Record Receipt Modal */}
      {showReceiptModal && (
        <div className="modal-backdrop" onClick={() => setShowReceiptModal(false)}>
          <div className="modal" style={{ maxWidth: 460 }} onClick={e => e.stopPropagation()}>
            <div className="modal-head">
              <h2>Record Offline Bank Receipt</h2>
              <button className="icon-btn" onClick={() => setShowReceiptModal(false)}>✕</button>
            </div>
            <form onSubmit={handleAddReceipt}>
              <div className="modal-body stack" style={{ gap: 12 }}>
                <div>
                  <label className="caption">Receipt Number</label>
                  <input
                    type="text"
                    className="input"
                    value={receiptNumber}
                    onChange={e => setReceiptNumber(e.target.value)}
                    required
                  />
                </div>
                <div className="grid2">
                  <div>
                    <label className="caption">Payment Method</label>
                    <select
                      className="input"
                      value={method}
                      onChange={e => setMethod(e.target.value as any)}
                    >
                      <option value="Bank transfer">Bank Wire / Transfer</option>
                      <option value="Cheque">Corporate Cheque</option>
                      <option value="Direct debit">Direct Debit</option>
                      <option value="Credit card">Card Transaction</option>
                    </select>
                  </div>
                  <div>
                    <label className="caption">Amount ({currencyFilter})</label>
                    <input
                      type="number"
                      className="input"
                      value={receiptAmount}
                      onChange={e => setReceiptAmount(Number(e.target.value))}
                      required
                    />
                  </div>
                </div>
                <div>
                  <label className="caption">Bank Reference / Cheque No.</label>
                  <input
                    type="text"
                    className="input"
                    value={reference}
                    onChange={e => setReference(e.target.value)}
                    placeholder="e.g. TX-QNB-998822"
                    required
                  />
                </div>
              </div>
              <div className="modal-foot">
                <button type="button" className="btn ghost sm" onClick={() => setShowReceiptModal(false)}>Cancel</button>
                <button type="submit" className="btn primary sm">Record Receipt</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Allocate Modal */}
      {showAllocateModal && selectedReceipt && (
        <div className="modal-backdrop" onClick={() => setShowAllocateModal(false)}>
          <div className="modal" style={{ maxWidth: 480 }} onClick={e => e.stopPropagation()}>
            <div className="modal-head">
              <h2>Allocate Receipt {selectedReceipt.receiptNumber}</h2>
              <button className="icon-btn" onClick={() => setShowAllocateModal(false)}>✕</button>
            </div>
            <form onSubmit={handleAllocate}>
              <div className="modal-body stack" style={{ gap: 12 }}>
                <div>
                  <label className="caption">Unallocated Funds Available</label>
                  <div><b>{formatCurrency(selectedReceipt.amount - selectedReceipt.allocatedAmount, selectedReceipt.currency)}</b></div>
                </div>
                <div>
                  <label className="caption">Select Outstanding Invoice</label>
                  <select
                    className="input"
                    value={targetInvoiceId}
                    onChange={e => setTargetInvoiceId(e.target.value)}
                    required
                  >
                    <option value="">-- Choose Invoice --</option>
                    {invoices.filter(i => i.paid < i.amount).map(inv => (
                      <option key={inv.id} value={inv.id}>
                        {inv.invoiceNumber} (Owed: {formatCurrency(inv.amount - inv.paid, inv.currency)})
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="caption">Amount to Allocate ({currencyFilter})</label>
                  <input
                    type="number"
                    max={selectedReceipt.amount - selectedReceipt.allocatedAmount}
                    className="input"
                    value={allocateAmount}
                    onChange={e => setAllocateAmount(Number(e.target.value))}
                    required
                  />
                </div>
              </div>
              <div className="modal-foot">
                <button type="button" className="btn ghost sm" onClick={() => setShowAllocateModal(false)}>Cancel</button>
                <button type="submit" className="btn primary sm">Apply Allocation</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
