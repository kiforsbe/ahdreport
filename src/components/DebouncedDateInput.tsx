import { useEffect, useState } from "react";

export function DebouncedDateInput({
  label,
  value,
  onChange,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
}) {
  const [draft, setDraft] = useState(value);
  useEffect(() => setDraft(value), [value]);
  useEffect(() => {
    if (draft === value) return;
    const timer = window.setTimeout(() => onChange(draft), 300);
    return () => window.clearTimeout(timer);
  }, [draft, onChange, value]);
  return (
    <label>
      {label}
      <input
        type="date"
        value={draft}
        onChange={(event) => setDraft(event.target.value)}
      />
    </label>
  );
}
