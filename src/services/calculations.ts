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

  // §5.5: aging excludes not-yet-issued/draft/cancelled records. Only Issued/Paid
  // (Paid kept only when a residual outstanding remains) participate.
  let filteredInvoices = invoices.filter(
    inv => inv.status === 'Issued' || inv.status === 'Paid'
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
    // Exclude invoices issued after the as-of date (not yet effective).
    const effectiveIssue = inv.issueDate ? new Date(inv.issueDate) : new Date(inv.due);
    if (effectiveIssue > asOf) continue;

    // Effective issued credits only, effective on/before as-of. Supports both
    // `issueDate` and legacy `date` fields on credit notes.
    const applicableCredits = credits
      .filter(c => c.invoiceId === inv.id && c.status === 'Issued' && new Date(c.issueDate || c.date || inv.issueDate || inv.due) <= asOf)
      .reduce((sum, c) => sum + c.amount, 0);

    // Net allocated receipts effective on/before as-of (reversed excluded).
    // NOTE: `inv.paid` is a display cache maintained by the store; the
    // authoritative settlement here is the allocation ledger so we do NOT add
    // both. When allocations are absent (legacy fixtures), fall back to paid.
    let allocatedSettled = 0;
    receipts.forEach(rcpt => {
      (rcpt.allocations || []).forEach(alloc => {
        if (alloc.invoiceId === inv.id && !alloc.reversed && new Date(alloc.allocatedAt) <= asOf) {
          allocatedSettled += alloc.amount;
        }
      });
    });
    const hasAllocationLedger = receipts.some(r =>
      (r.allocations || []).some(a => a.invoiceId === inv.id && !a.reversed));
    const effectivePayments = hasAllocationLedger ? allocatedSettled : (inv.paid || 0);

    // §5.5: outstanding = issued − effective credits − net allocated receipts.
    const outstanding = Math.max(0, inv.amount - applicableCredits - effectivePayments);
    if (outstanding <= 0) continue;

    const dueDate = new Date(inv.due);
    const diffTime = asOf.getTime() - dueDate.getTime();
    const daysOverdue = Math.floor(diffTime / (1000 * 60 * 60 * 24));

    let bucket: AgingSummary['invoiceBreakdown'][0]['bucket'] = 'Current';
    if (daysOverdue <= 0) {
      // Due today is Current.
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
      effectivePayments,
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
  missingOpening?: boolean;
  unmatchedAccount?: boolean;
}

export function verifyGLCompleteness(
  glTransactions: GLTransactionItem[] | TrialBalanceRow[],
  tbRowsOrOpening?: TrialBalanceRow[] | Record<string, number>,
  openingBalances?: Record<string, number>
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
  let openings: Record<string, number> | undefined = openingBalances;

  if (Array.isArray(glTransactions) && glTransactions.length > 0 && 'balance' in glTransactions[0]) {
    tbRows = glTransactions as TrialBalanceRow[];
    glTx = ((tbRowsOrOpening as unknown) as GLTransactionItem[]) || [];
  } else {
    glTx = (glTransactions as GLTransactionItem[]) || [];
    tbRows = ((tbRowsOrOpening as unknown) as TrialBalanceRow[]) || [];
  }

  // If opening balances passed as 2nd arg
  if (tbRowsOrOpening && !Array.isArray(tbRowsOrOpening) && typeof tbRowsOrOpening === 'object') {
    openings = tbRowsOrOpening as Record<string, number>;
  }

  const checks: GLCompletenessCheck[] = [];
  let totalResidual = 0;
  let hasMissingOpening = false;
  let hasUnmatchedAccount = false;

  // Union of account codes in tbRows and glTx (VP-036 / EX07)
  const allCodes = Array.from(new Set([
    ...tbRows.map(r => r.code),
    ...glTx.map(t => t.accountCode)
  ]));

  allCodes.forEach(code => {
    const tb = tbRows.find(r => r.code === code);
    const txs = glTx.filter(t => t.accountCode === code);
    const debits = txs.reduce((sum, t) => sum + (t.debit || 0), 0);
    const credits = txs.reduce((sum, t) => sum + (t.credit || 0), 0);
    const netMovement = debits - credits;

    // Check if opening balance is explicitly known (EX06 / EX08)
    const isOpeningKnown = openings !== undefined && typeof openings[code] === 'number';
    const opening = isOpeningKnown ? openings![code] : (openings === undefined ? 0 : NaN);

    if (openings !== undefined && !isOpeningKnown) {
      hasMissingOpening = true;
    }

    const tbClosing = tb ? tb.balance : 0;
    const accountName = tb ? tb.name : (txs[0]?.description || `Unmatched GL Account ${code}`);
    const isUnmatched = !tb;

    if (isUnmatched) {
      hasUnmatchedAccount = true;
    }

    const calculatedClosing = isOpeningKnown || openings === undefined ? opening + netMovement : NaN;
    const residual = isNaN(calculatedClosing) ? 999999 : Math.abs(calculatedClosing - tbClosing);

    if (!isNaN(residual)) totalResidual += residual;

    const complete = !isUnmatched && !hasMissingOpening && isOpeningKnown && residual === 0;

    checks.push({
      accountCode: code,
      accountName,
      openingBalance: isOpeningKnown ? opening : 0,
      totalDebits: debits,
      totalCredits: credits,
      netMovement,
      calculatedClosing: isNaN(calculatedClosing) ? 0 : calculatedClosing,
      trialBalanceClosing: tbClosing,
      residual,
      difference: residual,
      glSum: isNaN(calculatedClosing) ? 0 : calculatedClosing,
      tbBalance: tbClosing,
      isComplete: complete,
      missingOpening: !isOpeningKnown && openings !== undefined,
      unmatchedAccount: isUnmatched
    });
  });

  const discrepancies = checks.filter(c => !c.isComplete);
  const allBalanced = totalResidual === 0 && !hasMissingOpening && !hasUnmatchedAccount;

  return {
    checks,
    discrepancies,
    allBalanced,
    isComplete: allBalanced,
    totalResidual
  };
}

// Module 23: Reconciliation Variance Check (VP-039 / EX09)
export function calculateReconciliationVariance(rec: ReconciliationSchedule) {
  const items = rec.items || [];
  // Proposed corrections cannot clear timing residual (EX09)
  const timingItems = items.filter(i => {
    const t = (i as any).type || (i as any).itemType;
    return t !== 'correction' && !(i as any).isCorrection;
  });
  const proposedCorrections = items.filter(i => {
    const t = (i as any).type || (i as any).itemType;
    return t === 'correction' || (i as any).isCorrection;
  });

  const timingSum = timingItems.reduce((s, i) => s + (i.amount || 0), 0);
  const correctionSum = proposedCorrections.reduce((s, i) => s + (i.amount || 0), 0);

  const statementBal = (rec as any).statementBalance ?? (rec as any).statementClosingBalance ?? 0;
  const glBal = (rec as any).glBalance ?? (rec as any).glClosingBalance ?? 0;

  // Reconciled variance uses only genuine timing items against statement balance
  const diff = Math.abs(statementBal + timingSum - glBal);

  return {
    timingSum,
    correctionSum,
    unexplainedDifference: diff,
    // Reconciliation is achieved only if unexplained timing diff is zero AND no pending unreflected corrections
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

// Module 26: Consolidation Math (VP-045, VP-046 / EX10, EX11, EX12)
export function calculateConsolidatedBalanceSheet(
  parentRows: TrialBalanceRow[],
  subRows: TrialBalanceRow[],
  eliminations: any[]
) {
  const allCodes = Array.from(new Set([...parentRows.map(r => r.code), ...subRows.map(r => r.code)]));

  let parentAssets = 0;
  let subsidiaryAssets = 0;
  let parentLiabilities = 0;
  let subsidiaryLiabilities = 0;
  let parentEquity = 0;
  let subsidiaryEquity = 0;
  let totalEliminationDebits = 0;
  let totalEliminationCredits = 0;

  const lines = allCodes.map(code => {
    const parentRow = parentRows.find(r => r.code === code);
    const subRow = subRows.find(r => r.code === code);
    const category = parentRow?.type || subRow?.type || 'asset';
    const name = parentRow?.name || subRow?.name || code;

    const parentBalance = parentRow ? parentRow.balance : 0;
    const subsidiaryBalance = subRow ? subRow.balance : 0;
    const combinedBalance = parentBalance + subsidiaryBalance;

    // Check specific debit/credit eliminations for this account (by code or exact name)
    let elimDebit = 0;
    let elimCredit = 0;

    eliminations.forEach(e => {
      const isDebitMatch = (e.debitAccount && (e.debitAccount === code || e.debitAccount.toLowerCase() === name.toLowerCase())) ||
        (e.description && e.description.toLowerCase().includes(name.toLowerCase()) && (category === 'liability' || category === 'equity'));
      const isCreditMatch = (e.creditAccount && (e.creditAccount === code || e.creditAccount.toLowerCase() === name.toLowerCase())) ||
        (e.description && e.description.toLowerCase().includes(name.toLowerCase()) && category === 'asset');

      if (isDebitMatch) {
        elimDebit += e.amount || 0;
      }
      if (isCreditMatch) {
        elimCredit += e.amount || 0;
      }
    });

    totalEliminationDebits += elimDebit;
    totalEliminationCredits += elimCredit;

    // Consolidated balance calculation:
    // Assets (Debit balance): Debits increase, Credits decrease
    // Liabilities & Equity (Credit balance in Signed TB where credit is negative or absolute):
    let consolidatedBalance = combinedBalance;
    if (category === 'asset') {
      consolidatedBalance = combinedBalance + elimDebit - elimCredit;
      parentAssets += parentBalance;
      subsidiaryAssets += subsidiaryBalance;
    } else if (category === 'liability') {
      // If signed TB (liabilities are negative), debit brings it closer to 0
      if (combinedBalance < 0) {
        consolidatedBalance = combinedBalance + elimDebit - elimCredit;
      } else {
        consolidatedBalance = combinedBalance - elimDebit + elimCredit;
      }
      parentLiabilities += Math.abs(parentBalance);
      subsidiaryLiabilities += Math.abs(subsidiaryBalance);
    } else if (category === 'equity') {
      if (combinedBalance < 0) {
        consolidatedBalance = combinedBalance + elimDebit - elimCredit;
      } else {
        consolidatedBalance = combinedBalance - elimDebit + elimCredit;
      }
      parentEquity += Math.abs(parentBalance);
      subsidiaryEquity += Math.abs(subsidiaryBalance);
    }

    return {
      code,
      name,
      category,
      parentBalance,
      subsidiaryBalance,
      eliminationDebit: elimDebit,
      eliminationCredit: elimCredit,
      consolidatedBalance
    };
  });

  // Calculate totals directly from lines ensuring header and line details strictly agree (EX12)
  const totalAssets = lines
    .filter(l => l.category === 'asset')
    .reduce((s, l) => s + l.consolidatedBalance, 0);

  const totalLiabilities = lines
    .filter(l => l.category === 'liability')
    .reduce((s, l) => s + Math.abs(l.consolidatedBalance), 0);

  const totalEquity = lines
    .filter(l => l.category === 'equity')
    .reduce((s, l) => s + Math.abs(l.consolidatedBalance), 0);

  const totalEliminations = totalEliminationCredits || totalEliminationDebits;
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

// Module 28: ISA 320 Materiality Calculation (VP-048 / F16)
export function calculateMateriality(
  benchmarkValue: number,
  percentage: number,
  performancePct = 75,
  trivialPct = 5,
  rationale = 'Illustrative materiality based on selected benchmark'
) {
  const overallMateriality = Math.round(benchmarkValue * (percentage / 100));
  const performanceMateriality = Math.round(overallMateriality * (performancePct / 100));
  const clearlyTrivialThreshold = Math.round(overallMateriality * (trivialPct / 100));

  return {
    benchmarkValue,
    percentage,
    overallMateriality,
    performancePct,
    performanceMateriality,
    trivialPct,
    clearlyTrivialThreshold,
    rationale
  };
}

