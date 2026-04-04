export default function KamerasLoading() {
  return (
    <div className="min-h-screen bg-brand-bg">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* Header skeleton */}
        <div className="mb-8">
          <div className="h-8 w-48 rounded-lg animate-shimmer mb-2" />
          <div className="h-4 w-72 rounded-md animate-shimmer" />
        </div>

        {/* Filter bar skeleton */}
        <div className="flex gap-3 mb-8">
          {[1, 2, 3].map((i) => (
            <div key={i} className="h-10 w-24 rounded-btn animate-shimmer" />
          ))}
        </div>

        {/* Product grid skeleton */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
          {[1, 2, 3, 4, 5, 6].map((i) => (
            <div
              key={i}
              className="bg-white rounded-card border border-brand-border overflow-hidden"
            >
              <div className="aspect-[4/3] animate-shimmer" />
              <div className="p-5 space-y-3">
                <div className="h-5 w-3/4 rounded-md animate-shimmer" />
                <div className="h-4 w-1/2 rounded-md animate-shimmer" />
                <div className="flex justify-between items-center pt-2">
                  <div className="h-6 w-24 rounded-md animate-shimmer" />
                  <div className="h-10 w-28 rounded-btn animate-shimmer" />
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
