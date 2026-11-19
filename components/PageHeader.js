export default function PageHeader({ title, children, intro }) {
  return (
    <div className="mb-6 flex flex-wrap items-end justify-between gap-3">
      <div>
        <h1 className="text-2xl font-bold text-adire-900 sm:text-3xl">{title}</h1>
        {intro && <p className="mt-1 max-w-prose text-sm text-ink/70">{intro}</p>}
      </div>
      <div className="flex flex-wrap gap-2">{children}</div>
    </div>
  );
}
