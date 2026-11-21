import LoadingPanel from '@/components/LoadingPanel';

export default function MemberLoading() {
  return (
    <div className="space-y-5" aria-busy="true">
      <div className="skeleton h-9 w-56 rounded-lg" />
      <div className="panel p-6 pl-14">
        <div className="skeleton h-3 w-24 rounded-lg" />
        <div className="skeleton mt-3 h-12 w-64 rounded-lg" />
        <div className="skeleton mt-5 h-4 w-80 rounded-lg" />
      </div>
      <LoadingPanel title="Loading latest entries" rows={4} />
    </div>
  );
}
