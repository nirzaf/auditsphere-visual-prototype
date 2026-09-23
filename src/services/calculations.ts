// AuditSphere Deterministic Calculations & Financial Math
// VP-005, VP-028, VP-029, VP-033, VP-036, VP-038, VP-040, VP-046, VP-048

import {
  InvoiceRecord,
  ReceiptRecord,
  CreditNoteRecord,
  TrialBalanceRow,
  GLTransactionItem,
  BudgetRecord,
  TimeEntryItem,
  ConsolidationGroupRecord,
  EngagementRecord,
  ReconciliationSchedule
} from '../types';

export function formatCurrency(amount: number, currency = 'QAR'): string {
  return `${currency} ${amount.toLocaleString('en-US', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2
  })}`;
}

export function formatMinutesToHours(minutes: number): string {
  const hrs = minutes / 60;
  return `${hrs.toFixed(1)} hrs`;
}

// Module 15: Receivables Aging Calculation (VP-033)
export interface AgingSummary {
  current: number;
  days1_30: number;
  days31_60: number;
  days61_90: number;
  days31to60: number;
  days61to90: number;
  over90: number;
  olderThan90: number;
  totalOutstanding: number;
  totalOverdue: number;
  totalUnallocatedReceipts: number;
  invoiceBreakdown: Array<{
    invoice: InvoiceRecord;
    grossAmount: number;
    effectiveCredits: number;
    effectivePayments: number;
    outstanding: number;
    bucket: 'Current' | '1–30 days' | '31–60 days' | '61–90 days' | 'Over 90 days';
    daysOverdue: number;
  }>;
}

export function calculateReceivablesAging(
  invoices: InvoiceRecord[],
  creditsOrDate?: CreditNoteRecord[] | string,
  receiptsOrDate?: ReceiptRecord[] | string,
  asOfDateStr = '2026-09-23',
  clientFilter?: string
): AgingSummary {
  const credits: CreditNoteRecord[] = Array.isArray(creditsOrDate) ? creditsOrDate : [];
  const receipts: ReceiptRecord[] = Array.isArray(receiptsOrDate) ? receiptsOrDate : [];
  const dateStr = typeof creditsOrDate === 'string' ? creditsOrDate : typeof receiptsOrDate === 'string' ? receiptsOrDate : asOfDateStr;

  const asOf = new Date(dateStr);
  asOf.setHours(23, 59, 59, 999);

  let filteredInvoices = invoices.filter(
    inv => inv.status === 'Issued' || inv.status === 'Paid' || inv.status === 'Draft'
  );
  if (clientFilter) {
    filteredInvoices = filteredInvoices.filter(i => i.clientId === clientFilter);
  }

  let totalUnallocated = 0;
  receipts.forEach(rcpt => {
    if (clientFilter && rcpt.clientId !== clientFilter) return;
    const rcptDate = new Date(rcpt.date);
    if (rcptDate <= asOf) {
      const activeAllocations = (rcpt.allocations || [])
        .filter(a => !a.reversed && new Date(a.allocatedAt) <= asOf)
        .reduce((sum, a) => sum + a.amount, 0);
      totalUnallocated += Math.max(0, rcpt.amount - activeAllocations);
    }
  });

  const breakdown: AgingSummary['invoiceBreakdown'] = [];
  let current = 0;
  let days1_30 = 0;
  let days31_60 = 0;
  let days61_90 = 0;
  let over90 = 0;

  for (const inv of filteredInvoices) {
    const issueDate = inv.issueDate ? new Date(inv.issueDate) : new Date(inv.due);
    if (issueDate > asOf) continue;

    const applicableCredits = credits
      .filter(c => c.invoiceId === inv.id && (c.status === 'Issued' || (c as any).reason) && new Date(c.issueDate || (c as any).date || inv.issueDate) <= asOf)
      .reduce((sum, c) => sum + c.amount, 0);

    let applicablePayments = inv.paid || 0;
    receipts.forEach(rcpt => {
      (rcpt.allocations || []).forEach(alloc => {
        if (alloc.invoiceId === inv.id && !alloc.reversed && new Date(alloc.allocatedAt) <= asOf) {
          applicablePayments += alloc.amount;
        }
      });
    });

    const outstanding = Math.max(0, inv.amount - applicableCredits - (inv.paid || 0) - ((inv as any).creditsApplied || 0));
    if (outstanding <= 0 && inv.status === 'Paid') continue;

    const dueDate = new Date(inv.due);
    const diffTime = asOf.getTime() - dueDate.getTime();
    const daysOverdue = Math.floor(diffTime / (1000 * 60 * 60 * 24));

    let bucket: AgingSummary['invoiceBreakdown'][0]['bucket'] = 'Current';
    if (daysOverdue <= 0) {
      bucket = 'Current';
      current += outstanding;
    } else if (daysOverdue <= 30) {
      bucket = '1–30 days';
      days1_30 += outstanding;
    } else if (daysOverdue <= 60) {
      bucket = '31–60 days';
      days31_60 += outstanding;
    } else if (daysOverdue <= 90) {
      bucket = '61–90 days';
      days61_90 += outstanding;
    } else {
      bucket = 'Over 90 days';
      over90 += outstanding;
    }

    breakdown.push({
      invoice: inv,
      grossAmount: inv.amount,
      effectiveCredits: applicableCredits,
      effectivePayments: applicablePayments,
      outstanding,
      bucket,
      daysOverdue: Math.max(0, daysOverdue)
    });
  }

  const totalOutstanding = current + days1_30 + days31_60 + days61_90 + over90;
  const totalOverdue = days1_30 + days31_60 + days61_90 + over90;

  return {
    current,
    days1_30,
    days31_60,
    days61_90,
    days31to60: days31_60,
    days61to90: days61_90,
    over90,
    olderThan90: over90,
    totalOutstanding,
    totalOverdue,
    totalUnallocatedReceipts: totalUnallocated,
    invoiceBreakdown: breakdown
  };
}

// Module 13: Budget vs Actuals (VP-029)
export interface BudgetAnalysis {
  plannedMinutes: number;
  plannedHours: number;
  plannedFees: number;
  approvedMinutes: number;
  approvedHours: number;
  actualBillableValue: number;
  knownDeliveryCost: number | null;
  varianceHours: number;
  varianceFees: number;
}

export function calculateBudgetVsActual(
  budget: BudgetRecord | undefined,
  timeEntries: TimeEntryItem[],
  engagementId: string
): BudgetAnalysis {
  if (!budget) {
    return {
      plannedMinutes: 0,
      plannedHours: 0,
      plannedFees: 0,
      approvedMinutes: 0,
      approvedHours: 0,
      actualBillableValue: 0,
      knownDeliveryCost: null,
      varianceHours: 0,
      varianceFees: 0
    };
  }

  let plannedMinutes = 0;
  let plannedFees = 0;
  budget.lines.forEach(line => {
    plannedMinutes += (line as any).plannedMinutes || ((line as any).plannedHours ? (line as any).plannedHours * 60 : 0);
    const hours = (line as any).plannedMinutes ? (line as any).plannedMinutes / 60 : ((line as any).plannedHours || 0);
    plannedFees += Math.round(hours * ((line as any).billingRatePerHour || (line as any).billingRate || 200));
  });

  const engApprovedTimes = timeEntries.filter(
    t => t.engagementId === engagementId && t.status === 'Approved'
  );

  let approvedMinutes = 0;
  let actualBillableValue = 0;
  let hasMissingCostRate = false;
  let totalCost = 0;

  engApprovedTimes.forEach(entry => {
    approvedMinutes += entry.durationMinutes;
    const line = budget.lines.find(l => ((l as any).roleOrActivity || (l as any).role || '').toLowerCase() === entry.activity.toLowerCase()) || budget.lines[0];
    const rate = line ? ((line as any).billingRatePerHour || (line as any).billingRate || 200) : 200;
    const costRate = line ? ((line as any).costRatePerHour || (line as any).costRate) : 100;

    const hours = entry.durationMinutes / 60;
    if (entry.billable) {
      actualBillableValue += Math.round(hours * rate);
    }

    if (costRate !== undefined && costRate !== null) {
      totalCost += Math.round(hours * costRate);
    } else {
      hasMissingCostRate = true;
    }
  });

  const plannedHours = plannedMinutes / 60;
  const approvedHours = approvedMinutes / 60;
  const varianceHours = Number((approvedHours - plannedHours).toFixed(2));
  const varianceFees = actualBillableValue - plannedFees;

  return {
    plannedMinutes,
    plannedHours,
    plannedFees,
    approvedMinutes,
    approvedHours,
    actualBillableValue,
    knownDeliveryCost: hasMissingCostRate ? null : totalCost,
    varianceHours,
    varianceFees
  };
}

// Module 21 & 24: Trial Balance Totals (VP-035, VP-038, VP-040)
export function calculateTrialBalanceTotals(rows: TrialBalanceRow[]) {
  let assets = 0;
  let liabilities = 0;
  let openingEquity = 0;
  let revenue = 0;
  let expenses = 0;
  let totalBalance = 0;
  let totalDebits = 0;
  let totalCredits = 0;

  rows.forEach(r => {
    totalBalance += r.balance;
    if (r.balance > 0) totalDebits += r.balance;
    else totalCredits += Math.abs(r.balance);

    if (r.type === 'asset') assets += r.balance;
    else if (r.type === 'liability') liabilities += -r.balance;
    else if (r.type === 'equity') openingEquity += -r.balance;
    else if (r.type === 'revenue') revenue += -r.balance;
    else if (r.type === 'expense') expenses += r.balance;
  });

  const profit = revenue - expenses;
  const isBalanced = Math.abs(totalBalance) < 0.01;
  const netDifference = totalDebits - totalCredits;

  return {
    rows,
    assets,
    liabilities,
    openingEquity,
    revenue,
    expenses,
    profit,
    totalBalance,
    totalDebits,
    totalCredits,
    netDifference,
    isBalanced
  };
}

// Module 21: General Ledger Completeness Check (VP-036)
export interface GLCompletenessCheck {
  accountCode: string;
  accountName: string;
  openingBalance: number;
  totalDebits: number;
  totalCredits: number;
  netMovement: number;
  calculatedClosing: number;
  trialBalanceClosing: number;
  residual: number;
  difference: number;
  glSum: number;
  tbBalance: number;
  isComplete: boolean;
}

export function verifyGLCompleteness(
  glTransactions: GLTransactionItem[] | TrialBalanceRow[],
  tbRowsOrOpening?: TrialBalanceRow[] | Record<string, number>,
  openingBalances: Record<string, number> = {}
): {
  checks: GLCompletenessCheck[];
  discrepancies: GLCompletenessCheck[];
  allBalanced: boolean;
  isComplete: boolean;
  totalResidual: number;
} {
  // Support both (tbRows, glTransactions) and (glTransactions, tbRows) argument ordering
  let tbRows: TrialBalanceRow[];
  let glTx: GLTransactionItem[];

  if (Array.isArray(glTransactions) && glTransactions.length > 0 && 'balance' in glTransactions[0]) {
    tbRows = glTransactions as TrialBalanceRow[];
    glTx = ((tbRowsOrOpening as unknown) as GLTransactionItem[]) || [];
  } else {
    glTx = (glTransactions as GLTransactionItem[]) || [];
    tbRows = ((tbRowsOrOpening as unknown) as TrialBalanceRow[]) || [];
  }

  const checks: GLCompletenessCheck[] = [];
  let totalResidual = 0;

  tbRows.forEach(tb => {
    const opening = openingBalances[tb.code] || 0;
    const txs = glTx.filter(t => t.accountCode === tb.code);
    const debits = txs.reduce((sum, t) => sum + (t.debit || 0), 0);
    const credits = txs.reduce((sum, t) => sum + (t.credit || 0), 0);
    const netMovement = debits - credits;
    const calculatedClosing = opening + netMovement;
    const residual = Math.abs(calculatedClosing - tb.balance);

    totalResidual += residual;
    checks.push({
      accountCode: tb.code,
      accountName: tb.name,
      openingBalance: opening,
      totalDebits: debits,
      totalCredits: credits,
      netMovement,
      calculatedClosing,
      trialBalanceClosing: tb.balance,
      residual,
      difference: residual,
      glSum: calculatedClosing,
      tbBalance: tb.balance,
      isComplete: residual === 0
    });
  });

  const discrepancies = checks.filter(c => !c.isComplete);
  const allBalanced = totalResidual === 0;

  return {
    checks,
    discrepancies,
    allBalanced,
    isComplete: allBalanced,
    totalResidual
  };
}

// Module 23: Reconciliation Variance Check
export function calculateReconciliationVariance(rec: ReconciliationSchedule) {
  const items = rec.items || [];
  const timingSum = items.reduce((s, i) => s + (i.amount || 0), 0);
  const diff = Math.abs(((rec as any).statementBalance || (rec as any).statementClosingBalance || 0) + timingSum - ((rec as any).glBalance || (rec as any).glClosingBalance || 0));

  return {
    timingSum,
    unexplainedDifference: diff,
    isReconciled: diff === 0
  };
}

// Module 24: Financial Statements Math
export function calculateBalanceSheet(rows: TrialBalanceRow[]) {
  const assets = rows.filter(r => r.type === 'asset');
  const liabilities = rows.filter(r => r.type === 'liability');
  const equity = rows.filter(r => r.type === 'equity');

  const totalAssets = assets.reduce((s, a) => s + a.balance, 0);
  const totalLiabilities = liabilities.reduce((s, l) => s + Math.abs(l.balance), 0);
  const totalEquity = equity.reduce((s, e) => s + Math.abs(e.balance), 0);

  const difference = Math.abs(totalAssets - (totalLiabilities + totalEquity));
  const isBalanced = difference === 0;

  return {
    assets,
    liabilities,
    equity,
    totalAssets,
    totalLiabilities,
    totalEquity,
    difference,
    isBalanced
  };
}

export function calculateIncomeStatement(rows: TrialBalanceRow[]) {
  const revenues = rows.filter(r => r.type === 'revenue');
  const expenses = rows.filter(r => r.type === 'expense');

  const revenue = revenues.reduce((s, r) => s + Math.abs(r.balance), 0);
  const costOfSales = expenses.filter(e => e.name.toLowerCase().includes('cost') || e.code.startsWith('50')).reduce((s, e) => s + e.balance, 0);
  const operatingExpenses = expenses.filter(e => !e.name.toLowerCase().includes('cost') && !e.code.startsWith('50')).reduce((s, e) => s + e.balance, 0);

  const grossProfit = revenue - costOfSales;
  const netProfit = grossProfit - operatingExpenses;

  return {
    revenue,
    costOfSales,
    grossProfit,
    operatingExpenses,
    netProfit
  };
}

// Module 26: Consolidation Math
export function calculateConsolidatedBalanceSheet(
  parentRows: TrialBalanceRow[],
  subRows: TrialBalanceRow[],
  eliminations: any[]
) {
  const allCodes = Array.from(new Set([...parentRows.map(r => r.code), ...subRows.map(r => r.code)]));

  let parentAssets = 0;
  let subsidiaryAssets = 0;
  let totalEliminations = 0;
  let parentLiabilities = 0;
  let subsidiaryLiabilities = 0;
  let parentEquity = 0;
  let subsidiaryEquity = 0;

  const lines = allCodes.map(code => {
    const parentRow = parentRows.find(r => r.code === code);
    const subRow = subRows.find(r => r.code === code);
    const category = parentRow?.type || subRow?.type || 'asset';
    const name = parentRow?.name || subRow?.name || code;

    const parentBalance = parentRow ? parentRow.balance : 0;
    const subsidiaryBalance = subRow ? subRow.balance : 0;

    const elim = eliminations.find(e =>
      ((e.debitAccount || '') + (e.creditAccount || '') + (e.description || '')).toLowerCase().includes(name.toLowerCase())
    );

    const eliminationDebit = elim ? elim.amount : 0;
    const eliminationCredit = 0;

    let consolidatedBalance = parentBalance + subsidiaryBalance;
    if (elim) {
      consolidatedBalance -= elim.amount;
      totalEliminations += elim.amount;
    }

    if (category === 'asset') {
      parentAssets += parentBalance;
      subsidiaryAssets += subsidiaryBalance;
    } else if (category === 'liability') {
      parentLiabilities += Math.abs(parentBalance);
      subsidiaryLiabilities += Math.abs(subsidiaryBalance);
    } else if (category === 'equity') {
      parentEquity += Math.abs(parentBalance);
      subsidiaryEquity += Math.abs(subsidiaryBalance);
    }

    return {
      code,
      name,
      category,
      parentBalance,
      subsidiaryBalance,
      eliminationDebit,
      eliminationCredit,
      consolidatedBalance
    };
  });

  const totalAssets = parentAssets + subsidiaryAssets - totalEliminations;
  const totalLiabilities = parentLiabilities + subsidiaryLiabilities - totalEliminations;
  const totalEquity = parentEquity + subsidiaryEquity;

  const isBalanced = Math.abs(totalAssets - (totalLiabilities + totalEquity)) === 0;

  return {
    lines,
    parentAssets,
    subsidiaryAssets,
    parentLiabilities,
    subsidiaryLiabilities,
    parentEquity,
    subsidiaryEquity,
    totalEliminations,
    totalAssets,
    totalLiabilities,
    totalEquity,
    isBalanced
  };
}

// Module 28: ISA 320 Materiality Calculation (VP-048)
export function calculateMateriality(benchmarkValue: number, percentage: number) {
  const overallMateriality = Math.round(benchmarkValue * (percentage / 100));
  const performanceMateriality = Math.round(overallMateriality * 0.75); // 75% standard haircut
  const clearlyTrivialThreshold = Math.round(overallMateriality * 0.05); // 5% trivial boundary

  return {
    overallMateriality,
    performanceMateriality,
    clearlyTrivialThreshold
  };
}
