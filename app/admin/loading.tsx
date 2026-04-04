export default function AdminLoading() {
  return (
    <div className="p-6 space-y-6">
      {/* Header skeleton */}
      <div className="flex items-center justify-between">
        <div className="h-8 w-56 rounded-lg animate-shimmer" />
        <div className="h-10 w-32 rounded-btn animate-shimmer" />
      </div>

      {/* Stat cards skeleton */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {[1, 2, 3, 4].map((i) => (
          <div
            key={i}
            className="bg-white rounded-card border border-brand-border p-5 space-y-3"
          >
            <div className="h-4 w-24 rounded-md animate-shimmer" />
            <div className="h-8 w-16 rounded-md animate-shimmer" />
            <div className="h-3 w-32 rounded-md animate-shimmer" />
          </div>
        ))}
      </div>

      {/* Table skeleton */}
      <div className="bg-white rounded-card border border-brand-border overflow-hidden">
        <div className="p-4 border-b border-brand-border">
          <div className="h-5 w-36 rounded-md animate-shimmer" />
        </div>
        {[1, 2, 3, 4, 5].map((i) => (
          <div
            key={i}
            className="flex items-center gap-4 px-4 py-3 border-b border-brand-border last:border-0"
          >
            <div className="h-4 w-20 rounded-md animate-shimmer" />
            <div className="h-4 w-40 rounded-md animate-shimmer flex-1" />
            <div className="h-4 w-24 rounded-md animate-shimmer" />
            <div className="h-6 w-16 rounded-full animate-shimmer" />
          </div>
        ))}
      </div>
    </div>
  );
}
