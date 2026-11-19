import PageHeader from '@/components/PageHeader';
import ImportWizard from '@/components/ImportWizard';
import { requireStaff } from '@/lib/auth';
import { importMembers } from '@/app/admin/actions';

export default async function ImportPage() {
  await requireStaff({ adminOnly: true });
  return (
    <>
      <PageHeader title="Bulk import" intro="Move your paper records online in four steps.">
        <a href="/api/import-template" className="btn-gold">Download Excel template</a>
        <a href="/templates/member_import_template.csv" className="btn-quiet">CSV template</a>
      </PageHeader>
      <ol className="mb-6 max-w-2xl list-decimal space-y-1 pl-5 text-sm text-ink/80">
        <li>Pick a cut-off date, for example the last day of the month.</li>
        <li>From the paper ledger, write each member's total savings (and unpaid loan, if any) as at that date into the template.</li>
        <li>Upload the file. Fix any rows the check flags.</li>
        <li>Import, then give each member their claim code. They use it at the Activate account page to choose a password.</li>
      </ol>
      <p className="mb-6 max-w-2xl rounded-lg bg-marigold-100 px-4 py-3 text-sm text-marigold-700">Tip: format the member_no and phone columns as Text in Excel so leading zeros are kept (the check repairs missing zeros on phone numbers).</p>
      <ImportWizard action={importMembers} />
    </>
  );
}
