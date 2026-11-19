import Link from 'next/link';

export default function Logo({ href = '/', light = false }) {
  return (
    <Link href={href} className={`inline-flex items-center gap-2 font-display text-xl font-bold ${light ? 'text-white' : 'text-adire-800'}`}>
      <svg width="26" height="26" viewBox="0 0 26 26" aria-hidden="true">
        <rect x="2" y="3" width="22" height="20" rx="3" fill={light ? '#fff' : '#23307A'} />
        <path d="M7 9h12M7 13h12M7 17h7" stroke={light ? '#23307A' : '#EBB62B'} strokeWidth="2" strokeLinecap="round" />
      </svg>
      CoopLedger
    </Link>
  );
}
