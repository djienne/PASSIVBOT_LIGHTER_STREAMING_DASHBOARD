import { useDash } from "../lib/store";

export default function DebugGifButton() {
  const fireDebugWin = useDash(s => s.fireDebugWin);
  return (
    <button
      type="button"
      onClick={fireDebugWin}
      title="debug: fire win animation"
      aria-label="debug: fire win animation"
      className="fixed bottom-1 right-1 z-50 w-2.5 h-2.5 rounded-full bg-white/5 hover:bg-white/40 transition outline-none focus:outline-none"
    />
  );
}
