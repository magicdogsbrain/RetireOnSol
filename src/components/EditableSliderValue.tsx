import { useState, useRef } from 'react';

export function EditableSliderValue({ value, min, max, step, prefix, suffix, onChange }: {
  value: number; min: number; max: number; step: number;
  prefix?: string; suffix?: string;
  onChange: (v: number) => void;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState('');
  const prevValueRef = useRef(value);
  const lastSetRef = useRef<number | null>(null);

  const maxDigits = step < 1
    ? String(Math.round(max)).length + 1 + (String(step).split('.')[1]?.length ?? 1)
    : String(Math.round(max)).length;

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const raw = e.target.value;
    const cleanLen = raw.replace(/[^0-9]/g, '').length;
    if (cleanLen > maxDigits) return;

    setDraft(raw);

    // Always move slider — clamped to [min, max]
    const n = parseFloat(raw);
    if (!isNaN(n)) {
      const clamped = Math.min(max, Math.max(min, n));
      lastSetRef.current = clamped;
      onChange(clamped);
    }
  };

  const handleFocus = () => {
    prevValueRef.current = value;
    lastSetRef.current = null;
    setDraft('');
    setEditing(true);
  };

  const handleBlur = () => {
    lastSetRef.current = null;
    setEditing(false);
    const n = parseFloat(draft);
    if (draft === '' || isNaN(n)) {
      onChange(prevValueRef.current);
    } else {
      onChange(Math.min(max, Math.max(min, n)));
    }
  };

  // Show draft while editing — UNLESS an external source (slider) changed the value
  // to something different from what we last set via the input
  const externalChange = editing && lastSetRef.current !== null && value !== lastSetRef.current;
  const showDraft = editing && !externalChange;

  const displayValue = step < 1 ? value.toFixed(1) : String(value);
  const shownText = showDraft ? (draft === '' ? '_' : draft) : displayValue;

  return (
    <span className={`slider-value slider-value-editable${editing ? ' editing' : ''}`}>
      {prefix}{shownText}{suffix}
      <input
        className="slider-value-input"
        type="text"
        inputMode={step < 1 ? 'decimal' : 'numeric'}
        value={editing ? draft : ''}
        onChange={handleChange}
        onFocus={handleFocus}
        onBlur={handleBlur}
        onKeyDown={(e) => {
          if (e.key === 'Enter') (e.target as HTMLInputElement).blur();
          if (e.key === 'Escape') { setEditing(false); (e.target as HTMLInputElement).blur(); }
        }}
      />
    </span>
  );
}
