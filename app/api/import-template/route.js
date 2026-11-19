import * as XLSX from 'xlsx';

export const dynamic = 'force-dynamic';

export async function GET() {
  const rows = [
    ['member_no', 'full_name', 'phone', 'email', 'opening_savings', 'opening_loan_balance'],
    ['001', 'Adeola Bamidele', '08012345678', 'adeola@example.com', 150000, 0],
    ['002', 'Chinedu Okafor', '08123456789', '', 85500.5, 20000],
    ['003', 'Fatima Bello', '+2347031234567', 'fatima@example.com', 240000, 0],
  ];
  const ws = XLSX.utils.aoa_to_sheet(rows);
  ws['!cols'] = [{ wch: 10 }, { wch: 24 }, { wch: 16 }, { wch: 26 }, { wch: 16 }, { wch: 20 }];
  const notes = XLSX.utils.aoa_to_sheet([
    ['How to fill this template'],
    ['member_no: required, unique. Format the column as Text to keep leading zeros.'],
    ['full_name: required, at least 3 characters.'],
    ['phone: required, Nigerian mobile number.'],
    ['email: optional.'],
    ['opening_savings: required. Savings balance as at your cut-off date (naira, up to 2 decimals).'],
    ['opening_loan_balance: optional. Loan still owed as at the cut-off date.'],
    ['Delete the three sample rows before you upload.'],
  ]);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'Members');
  XLSX.utils.book_append_sheet(wb, notes, 'Instructions');
  const buf = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });
  return new Response(buf, {
    headers: {
      'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'Content-Disposition': 'attachment; filename="member_import_template.xlsx"',
    },
  });
}
