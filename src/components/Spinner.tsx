export default function Spinner({ label }: { label: string }) {
  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-3 py-16 text-center">
      <span className="h-8 w-8 animate-spin rounded-full border-2 border-plum border-t-chord-gold" />
      <p className="text-sm text-lilac-light">{label}</p>
    </div>
  );
}
