"use client";

export default function UndoToast({
  message,
  onUndo,
}: {
  message: string;
  onUndo: () => void;
}) {
  return (
    <div className="fixed inset-x-0 bottom-24 z-50 flex justify-center px-4">
      <div className="flex items-center gap-3 rounded-full bg-plum-deep px-4 py-2.5 shadow-2xl">
        <span className="text-sm text-mist">{message}</span>
        <button onClick={onUndo} className="text-sm font-semibold text-chord-gold">
          Deshacer
        </button>
      </div>
    </div>
  );
}
