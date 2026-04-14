export default function Loading() {
  return (
    <div className="space-y-8 animate-pulse">
      <div>
        <div className="h-8 w-48 bg-white/5 rounded" />
        <div className="h-4 w-80 bg-white/5 rounded mt-3" />
      </div>
      <div className="grid grid-cols-2 sm:grid-cols-2 md:grid-cols-4 gap-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="h-24 rounded-lg bg-white/5" />
        ))}
      </div>
      <div className="grid md:grid-cols-2 gap-6">
        <div className="h-64 rounded-lg bg-white/5" />
        <div className="h-64 rounded-lg bg-white/5" />
      </div>
    </div>
  );
}
