export function Toast({ message }: { message: string | null; onDone?: () => void }) {
  if (!message) return null;
  return (
    <div className="toast" role="status" aria-live="polite">
      {message}
    </div>
  );
}
