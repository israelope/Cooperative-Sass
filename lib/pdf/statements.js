import { createPdf, ngn, fmtDate, COLORS } from '@/lib/pdf/kit';
import { PURPOSE_LABEL } from '@/lib/statement';

const periodText = (from, to) => (from || to ? `${from ? fmtDate(from) : 'Beginning'} to ${to ? fmtDate(to) : 'today'}` : 'All activity to date');
const CHANNEL_LABEL = { online: 'Online (Paystack)', cash: 'Cash', transfer: 'Bank transfer', recorded: 'Recorded by officer' };
const ENTRY_LABEL = { opening: 'Opening balance', contribution: 'Contribution', withdrawal: 'Withdrawal', loan_disbursed: 'Loan paid out', repayment: 'Loan repayment' };

/**
 * Member statement.
 * data: { coopName, member: { member_no, full_name, status }, summary: { savings, outstanding, loan_limit },
 *         period: { from, to }, broughtForward, rows, closing, loans, generatedAt }
 */
export async function buildMemberStatement(data) {
  const { coopName, member, summary, period, broughtForward, rows, closing, loans = [], generatedAt = new Date() } = data;
  const pdf = await createPdf({ title: `Statement of account - ${member.full_name}` });
  pdf.header(coopName, 'Member statement of account');

  pdf.text(member.full_name, pdf.MARGIN, pdf.y - 4, { size: 14, isBold: true, maxWidth: pdf.W });
  pdf.y -= 18;
  pdf.text(`Member number ${member.member_no}  |  Period: ${periodText(period.from, period.to)}`, pdf.MARGIN, pdf.y - 2, { size: 9.5, color: COLORS.muted });
  pdf.y -= 22;

  pdf.summaryBoxes([
    { label: 'Savings balance now', value: ngn(summary?.savings), color: undefined },
    { label: 'Loan still owed', value: ngn(summary?.outstanding) },
    { label: 'Eligible to borrow', value: ngn(summary?.loan_limit) },
  ]);

  pdf.sectionTitle('Savings account activity');
  const body = [];
  if (period.from) body.push({ date: fmtDate(period.from), desc: 'Balance brought forward', credit: '', debit: '', balance: ngn(broughtForward), _bold: true });
  let credits = 0, debits = 0;
  for (const e of rows) {
    const amt = Number(e.amount);
    const label = e.note || ENTRY_LABEL[e.entry_type] || e.entry_type;
    if (e.entry_type === 'opening' || e.entry_type === 'contribution') { credits += amt; body.push({ date: fmtDate(e.entry_date), desc: label, credit: ngn(amt), debit: '', balance: ngn(e.running_balance) }); }
    else if (e.entry_type === 'withdrawal') { debits += amt; body.push({ date: fmtDate(e.entry_date), desc: label, credit: '', debit: ngn(amt), balance: ngn(e.running_balance) }); }
    else body.push({ date: fmtDate(e.entry_date), desc: `${label}: ${ngn(amt)} (loan, savings unchanged)`, credit: '', debit: '', balance: ngn(e.running_balance), _color: COLORS.muted });
  }
  body.push({ date: '', desc: 'Closing balance', credit: ngn(credits), debit: ngn(debits), balance: ngn(closing), _bold: true });
  pdf.table({
    columns: [
      { key: 'date', label: 'Date', width: 13 }, { key: 'desc', label: 'Description', width: 43 },
      { key: 'credit', label: 'Credit', width: 15, align: 'right' }, { key: 'debit', label: 'Debit', width: 14, align: 'right' },
      { key: 'balance', label: 'Balance', width: 17, align: 'right' },
    ],
    rows: body,
  });

  if (loans.length) {
    pdf.sectionTitle('Loans');
    pdf.table({
      columns: [
        { key: 'date', label: 'Requested', width: 16 }, { key: 'principal', label: 'Amount', width: 20, align: 'right' },
        { key: 'total', label: 'Total to repay', width: 22, align: 'right' }, { key: 'repaid', label: 'Repaid', width: 20, align: 'right' },
        { key: 'owed', label: 'Outstanding', width: 22, align: 'right' }, { key: 'status', label: 'Status', width: 14 },
      ],
      rows: loans.map((l) => ({
        date: fmtDate(l.created_at), principal: ngn(l.principal), total: l.total_repayable ? ngn(l.total_repayable) : '',
        repaid: ngn(l.amount_repaid), owed: l.total_repayable ? ngn(Number(l.total_repayable) - Number(l.amount_repaid)) : '', status: l.status,
      })),
    });
  }

  pdf.paragraph('This statement is generated from your cooperative\'s digital ledger. Entries are never edited; corrections appear as new lines. Loan lines are shown for information and do not change the savings balance. Please report any difference to your cooperative\'s officers.');
  return pdf.finish(`${coopName}  |  Generated ${fmtDate(generatedAt)} by CoopLedger`);
}

/**
 * Cooperative statement for admins / bookkeepers (the output of the cooperative_statement() SQL function).
 */
export async function buildCooperativeStatement(data, generatedAt = new Date()) {
  const { coop, period, summary: s, members, payments } = data;
  const pdf = await createPdf({ title: `Cooperative statement - ${coop.name}` });
  pdf.header(coop.name, 'Cooperative statement of account');
  pdf.text(`Period: ${periodText(period.from, period.to)}`, pdf.MARGIN, pdf.y - 4, { size: 10, isBold: true });
  pdf.y -= 22;

  pdf.summaryBoxes([
    { label: 'Collected in period', value: ngn(s.collected) },
    { label: 'Contributions', value: ngn(s.contributions) },
    { label: 'Loan repayments', value: ngn(s.repayments) },
    { label: 'Online (Paystack)', value: ngn(s.online) },
    { label: 'Cash', value: ngn(s.cash) },
    { label: 'Bank transfer', value: ngn(s.transfer) },
  ]);
  pdf.summaryBoxes([
    { label: 'Members (active / total)', value: `${s.members_active} / ${s.members_total}` },
    { label: 'Total member savings (now)', value: ngn(s.total_savings) },
    { label: 'Loans outstanding (now)', value: ngn(s.loans_outstanding) },
  ]);
  if (Number(s.recorded) > 0) pdf.paragraph(`Includes ${ngn(s.recorded)} of loan repayments recorded by an officer outside the online payment flow.`);

  pdf.sectionTitle(`Member balances (as at ${fmtDate(generatedAt)})`);
  pdf.table({
    columns: [
      { key: 'no', label: 'No.', width: 11 }, { key: 'name', label: 'Member', width: 36 }, { key: 'status', label: 'Status', width: 13 },
      { key: 'savings', label: 'Savings', width: 20, align: 'right' }, { key: 'owed', label: 'Loan owed', width: 20, align: 'right' },
    ],
    rows: [
      ...members.map((m) => ({ no: m.member_no, name: m.full_name, status: m.status, savings: ngn(m.savings), owed: Number(m.outstanding) ? ngn(m.outstanding) : '' })),
      { no: '', name: 'Total', status: '', savings: ngn(s.total_savings), owed: ngn(s.loans_outstanding), _bold: true },
    ],
  });

  pdf.sectionTitle(`Payments received (${s.payments_count})`);
  pdf.table({
    columns: [
      { key: 'date', label: 'Date', width: 12 }, { key: 'member', label: 'Member', width: 25 }, { key: 'purpose', label: 'For', width: 15 },
      { key: 'channel', label: 'Channel', width: 16 }, { key: 'ref', label: 'Reference', width: 16 }, { key: 'amount', label: 'Amount', width: 16, align: 'right' },
    ],
    size: 8,
    rows: [
      ...payments.map((p) => ({ date: fmtDate(p.date), member: `${p.member_no} ${p.member}`, purpose: PURPOSE_LABEL[p.purpose] || p.purpose, channel: CHANNEL_LABEL[p.channel] || p.channel, ref: p.reference, amount: ngn(p.amount) })),
      { date: '', member: 'Total', purpose: '', channel: '', ref: '', amount: ngn(s.collected), _bold: true },
    ],
    emptyText: 'No payments in this period.',
  });

  pdf.paragraph('Online payments are settled by Paystack directly into the cooperative\'s registered bank account on Paystack\'s settlement schedule. This statement lists payments recorded on CoopLedger; reconcile it with your bank statement.');
  return pdf.finish(`${coop.name}  |  Generated ${fmtDate(generatedAt)} by CoopLedger`);
}
