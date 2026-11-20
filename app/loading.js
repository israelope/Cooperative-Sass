import LoadingPanel from '@/components/LoadingPanel';

export default function Loading() {
  return (
    <div className="space-y-5" aria-busy="true">
      <div className="skeleton h-9 w-64 rounded-lg" />
      <div className="grid gap-px overflow-hidden rounded-xl bg-rule ring-1 ring-rule sm:grid-cols-3 lg:grid-cols-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="bg-white px-5 py-5">
            <div className="skeleton h-3 w-24 rounded" />
            <div className="skeleton mt-3 h-7 w-32 rounded" />
          </div>
        ))}
      </div>
      <LoadingPanel title="Loading page" rows={5} />
    </div>
  );
}
