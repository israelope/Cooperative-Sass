import Link from 'next/link';
import Logo from '@/components/Logo';

const SAMPLE = [
  ['03 Oct', 'Online payment', '25,000.00', '410,000.00'],
  ['05 Sep', 'Cash payment', '25,000.00', '385,000.00'],
  ['02 Aug', 'Online payment', '25,000.00', '360,000.00'],
  ['01 Jul', 'Opening balance', '335,000.00', '335,000.00'],
];

export default function Home() {
  return (
    <div className="min-h-screen">
      <header className="mx-auto flex max-w-6xl items-center justify-between px-5 py-5">
        <Logo />
        <nav className="flex items-center gap-2">
          <Link href="/claim" className="btn-quiet btn-sm">Claim account</Link>
          <Link href="/login" className="btn-primary btn-sm">Log in</Link>
        </nav>
      </header>

      <section className="mx-auto grid max-w-6xl items-center gap-10 px-5 pb-16 pt-6 md:grid-cols-2 md:pt-14">
        <div>
          <h1 className="text-4xl font-extrabold leading-[1.05] text-adire-900 sm:text-5xl">
            The passbook that updates itself when your members pay.
          </h1>
          <p className="mt-5 max-w-prose text-lg text-ink/75">
            CoopLedger gives every thrift and credit society its own private workspace. Members see their savings and loan limit any time of day. Treasurers stop copying bank alerts into ledgers.
          </p>
          <div className="mt-7 flex flex-wrap gap-3">
            <Link href="/register" className="btn-gold">Register your cooperative</Link>
            <Link href="/claim" className="btn-quiet">I have a claim code</Link>
          </div>
          <p className="mt-4 text-sm text-ink/60">Moving from paper? Upload a spreadsheet and hand each member a claim code. No one creates 500 passwords by hand.</p>
        </div>

        <div className="passbook-page p-5 pl-12 shadow-[0_18px_40px_-24px_rgba(20,23,43,.35)]" aria-label="Sample digital passbook">
          <p className="font-display text-sm font-semibold text-adire-800">Adeola Thrift Society · Member 014</p>
          <p className="mt-1 text-sm text-ink/60">Savings balance</p>
          <p className="num font-display text-4xl font-extrabold text-adire-900">₦410,000.00</p>
          <div className="table-wrap mt-4">
            <table className="tbl num">
              <thead><tr><th>Date</th><th>Entry</th><th className="text-right">Amount</th><th className="text-right">Balance</th></tr></thead>
              <tbody>
                {SAMPLE.map((r) => (
                  <tr key={r[0]}><td>{r[0]}</td><td>{r[1]}</td><td className="text-right">{r[2]}</td><td className="text-right font-semibold">{r[3]}</td></tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </section>

      <section className="border-t border-rule bg-white">
        <div className="mx-auto grid max-w-6xl gap-8 px-5 py-12 md:grid-cols-3">
          <div>
            <h2 className="text-lg font-bold text-adire-900">Each society is walled off</h2>
            <p className="mt-2 text-sm text-ink/75">One cooperative can never see another's members or money. The database itself enforces the wall, not just the app.</p>
          </div>
          <div>
            <h2 className="text-lg font-bold text-adire-900">Online payments post themselves</h2>
            <p className="mt-2 text-sm text-ink/75">Contributions go straight to the cooperative's own bank account through Paystack. Verified payments reach the passbook within seconds.</p>
          </div>
          <div>
            <h2 className="text-lg font-bold text-adire-900">Cash still counts</h2>
            <p className="mt-2 text-sm text-ink/75">Bookkeepers record cash and transfers with a photo of the receipt, so members can check every entry.</p>
          </div>
        </div>
      </section>
      <footer className="px-5 py-6 text-center text-xs text-ink/50">CoopLedger · Final-year project, Department of Computer Science, University of Ibadan</footer>
    </div>
  );
}
