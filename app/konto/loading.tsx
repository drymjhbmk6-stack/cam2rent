export default function KontoLoading() {
  return (
    <div className="min-h-screen bg-brand-bg">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div className="grid grid-cols-1 lg:grid-cols-[240px_1fr] gap-8">
          {/* Sidebar skeleton */}
          <div className="bg-white rounded-card border border-brand-border p-5 space-y-4 h-fit">
            <div className="flex items-center gap-3 mb-4">
              <div className="w-10 h-10 rounded-full animate-shimmer" />
              <div className="space-y-1.5">
                <div className="h-4 w-28 rounded-md animate-shimmer" />
                <div className="h-3 w-36 rounded-md animate-shimmer" />
              </div>
            </div>
            {[1, 2, 3, 4, 5, 6].map((i) => (
              <div key={i} className="h-9 w-full rounded-md animate-shimmer" />
            ))}
          </div>

          {/* Content skeleton */}
          <div className="bg-white rounded-card border border-brand-border p-6 space-y-6">
            <div className="h-7 w-40 rounded-lg animate-shimmer" />
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              {[1, 2, 3, 4].map((i) => (
                <div key={i} className="space-y-2">
                  <div className="h-4 w-20 rounded-md animate-shimmer" />
                  <div className="h-10 w-full rounded-btn animate-shimmer" />
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
