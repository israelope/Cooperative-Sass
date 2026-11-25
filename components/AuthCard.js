import Image from 'next/image';
import Logo from '@/components/Logo';

/** Shared frame for login, register, claim, suspended and join pages. */
export default function AuthCard({ title, intro, children, footer, wide = false }) {
  return (
    <main className="relative isolate mx-auto flex min-h-screen w-full flex-col justify-center overflow-hidden px-5 py-10">
      <Image src="/images/hero-mobile-payment.jpg" alt="" aria-hidden="true" fill sizes="100vw" className="-z-10 object-cover opacity-[0.07]" />
      <div aria-hidden="true" className="absolute inset-0 -z-10 bg-linear-to-b from-white/50 via-chalk/60 to-white/70" />
      <div className={`relative mx-auto w-full ${wide ? 'max-w-xl' : 'max-w-md'}`}>
        <Logo />
        <div className="panel mt-6 p-6 shadow-[0_18px_48px_-32px_rgba(20,23,43,.35)] sm:p-8">
          <h1 className="text-3xl font-bold text-accent-900">{title}</h1>
          {intro && <p className="mt-2 text-sm leading-relaxed text-ink/75">{intro}</p>}
          <div className="mt-6">{children}</div>
          {footer && <div className="mt-6 border-t border-rule pt-5 text-sm text-ink/75">{footer}</div>}
        </div>
      </div>
    </main>
  );
}
