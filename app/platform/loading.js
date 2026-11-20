import LoadingPanel from '@/components/LoadingPanel';

export default function PlatformLoading() {
  return (
    <div className="space-y-5" aria-busy="true">
      <div className="skeleton h-9 w-72 rounded-lg" />
      <div className="grid gap-px overflow-hidden rounded-xl bg-rule ring-1 ring-rule sm:grid-cols-3 lg:grid-cols-4">
        {Array.from({ length: 12 }).map((_, i) => (
          <div key={i} className="bg-white px-5 py-4">
            <div className="skeleton h-3 w-28 rounded" />
            <div className="skeleton mt-3 h-7 w-32 rounded" />
            <div className="skeleton mt-2 h-3 w-24 rounded" />
          </div>
        ))}
      </div>
      <div className="grid gap-5 lg:grid-cols-2">
        <LoadingPanel title="Loading charts" rows={4} />
        <LoadingPanel title="Loading tables" rows={4} />
      </div>
    </div>
  );
}
