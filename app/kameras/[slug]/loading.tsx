export default function ProductDetailLoading() {
  return (
    <div className="min-h-screen bg-brand-bg">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* Breadcrumb skeleton */}
        <div className="h-4 w-64 rounded-md animate-shimmer mb-6" />

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
          {/* Image gallery skeleton */}
          <div>
            <div className="aspect-square bg-white rounded-card border border-brand-border animate-shimmer" />
            <div className="flex gap-2 mt-3">
              {[1, 2, 3, 4].map((i) => (
                <div
                  key={i}
                  className="w-16 h-16 rounded-lg animate-shimmer"
                />
              ))}
            </div>
          </div>

          {/* Product info skeleton */}
          <div className="space-y-4">
            <div className="h-4 w-20 rounded-md animate-shimmer" />
            <div className="h-8 w-3/4 rounded-lg animate-shimmer" />
            <div className="h-4 w-full rounded-md animate-shimmer" />
            <div className="h-4 w-2/3 rounded-md animate-shimmer" />

            {/* Price */}
            <div className="bg-white rounded-card border border-brand-border p-5 space-y-3">
              <div className="h-7 w-32 rounded-md animate-shimmer" />
              <div className="h-4 w-48 rounded-md animate-shimmer" />
              <div className="h-12 w-full rounded-btn animate-shimmer mt-4" />
            </div>

            {/* Specs */}
            <div className="bg-white rounded-card border border-brand-border p-5 space-y-3">
              <div className="h-5 w-40 rounded-md animate-shimmer" />
              {[1, 2, 3, 4].map((i) => (
                <div key={i} className="flex justify-between">
                  <div className="h-4 w-24 rounded-md animate-shimmer" />
                  <div className="h-4 w-32 rounded-md animate-shimmer" />
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
