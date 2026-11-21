import Logo from '@/components/Logo';

/** Shared frame for login, register, claim, suspended and join pages. */
export default function AuthCard({ title, intro, children, footer, wide = false }) {
  return (
    <main className="mx-auto flex min-h-screen w-full flex-col justify-center px-5 py-10">
      <div className={`mx-auto w-full ${wide ? 'max-w-xl' : 'max-w-md'}`}>
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
