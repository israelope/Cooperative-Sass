import Icon from '@/components/Icon';
import PageHeader from '@/components/PageHeader';
import ImportWizard from '@/components/ImportWizard';
import { requireStaff } from '@/lib/auth';
import { importMembers } from '@/app/admin/actions';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Bulk import' };

export default async function ImportPage() {
  await requireStaff({ adminOnly: true });
  return (
    <>
      <PageHeader title="Bulk import" intro="Move your paper records online in four steps." icon="upload">
        <a href="/api/import-template" className="btn-gold"><Icon name="download" size={16} /> Download Excel template</a>
        <a href="/templates/member_import_template.csv" className="btn-quiet"><Icon name="download" size={16} /> CSV template</a>
      </PageHeader>

      <section className="panel mb-6 max-w-2xl p-5">
        <h2 className="flex items-center gap-2 text-lg font-bold text-adire-900"><Icon name="book" size={18} className="text-adire-500" /> How to prepare your file</h2>
        <ol className="mt-3 list-decimal space-y-1 pl-5 text-sm text-ink/75">
          <li>Pick a cut-off date, for example the last day of the month.</li>
          <li>From the paper ledger, write each member's total savings (and unpaid loan, if any) as at that date into the template.</li>
          <li>Upload the file. Fix any rows the check flags.</li>
          <li>Import, then give each member their claim code. They use it at the Activate account page to choose a password.</li>
        </ol>
      </section>

      <div className="callout-warn mb-6" role="status">
        <Icon name="alertTriangle" size={18} className="mt-0.5" />
        <p><span className="font-semibold">Tip:</span> format the member_no and phone columns as Text in Excel so leading zeros are kept (the check repairs missing zeros on phone numbers).</p>
      </div>

      <ImportWizard action={importMembers} />
    </>
  );
}
