export function Composer({
  draft,
  onChange,
  onSend,
  disabled,
}: {
  draft: string;
  onChange: (v: string) => void;
  onSend: () => void;
  disabled?: boolean;
}) {
  return (
    <div className="composer">
      <textarea
        rows={2}
        value={draft}
        placeholder="Message this chat"
        onChange={(e) => onChange(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            if (draft.trim() && !disabled) onSend();
          }
        }}
      />
      <button disabled={!draft.trim() || disabled} onClick={onSend}>
        Send
      </button>
    </div>
  );
}
