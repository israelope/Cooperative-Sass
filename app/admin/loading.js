import LoadingPanel from '@/components/LoadingPanel';

export default function AdminLoading() {
  return (
    <div className="space-y-5" aria-busy="true">
      <div className="skeleton h-9 w-64 rounded-lg" />
      <div className="grid gap-px overflow-hidden rounded-xl bg-rule ring-1 ring-rule sm:grid-cols-3 lg:grid-cols-6">
        {Array.from({ length: 6 }).map((_, i) => (
          <div key={i} className="bg-white px-5 py-4">
            <div className="skeleton h-3 w-24 rounded" />
            <div className="skeleton mt-3 h-7 w-28 rounded" />
          </div>
        ))}
      </div>
      <div className="grid gap-5 lg:grid-cols-5">
        <LoadingPanel title="Loading collections chart" rows={4} className="lg:col-span-2" />
        <LoadingPanel title="Loading payments" rows={5} className="lg:col-span-3" />
      </div>
    </div>
  );
}
