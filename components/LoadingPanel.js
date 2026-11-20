export default function LoadingPanel({ title = 'Loading', rows = 4, className = '' }) {
  return (
    <section className={`panel p-5 ${className}`} aria-busy="true" aria-label={title}>
      <div className="skeleton h-5 w-40 rounded" />
      <div className="mt-5 space-y-3">
        {Array.from({ length: rows }).map((_, i) => (
          <div key={i} className="flex items-center gap-4">
            <div className="skeleton h-4 w-1/4 rounded" />
            <div className="skeleton h-4 flex-1 rounded" />
            <div className="skeleton h-4 w-1/5 rounded" />
          </div>
        ))}
      </div>
      <span className="sr-only">{title}</span>
    </section>
  );
}
