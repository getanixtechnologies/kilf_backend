import { KeyboardEvent, useRef } from 'react';
import { Plus, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';

interface PerksInputProps {
  value: string[];
  onChange: (value: string[]) => void;
  placeholders?: string[];
}

/** One input per perk, with add/remove. Enter adds a new point below. */
export function PerksInput({ value, onChange, placeholders = [] }: PerksInputProps) {
  const items = value.length ? value : [''];
  const refs = useRef<(HTMLInputElement | null)[]>([]);

  const focusAt = (i: number) => requestAnimationFrame(() => refs.current[i]?.focus());

  const update = (i: number, text: string) => onChange(items.map((p, j) => (j === i ? text : p)));

  const insertAfter = (i: number) => {
    onChange([...items.slice(0, i + 1), '', ...items.slice(i + 1)]);
    focusAt(i + 1);
  };

  const remove = (i: number) => {
    const next = items.filter((_, j) => j !== i);
    onChange(next.length ? next : ['']);
    focusAt(Math.max(0, i - 1));
  };

  const onKeyDown = (i: number) => (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      insertAfter(i);
    } else if (e.key === 'Backspace' && items[i] === '' && items.length > 1) {
      e.preventDefault();
      remove(i);
    }
  };

  return (
    <div className="space-y-2">
      {items.map((perk, i) => (
        <div key={i} className="flex items-center gap-2">
          <span className="w-4 shrink-0 text-center text-muted-foreground">•</span>
          <Input
            ref={(el) => {
              refs.current[i] = el;
            }}
            id={i === 0 ? 'perks' : undefined}
            aria-label={`Perk ${i + 1}`}
            value={perk}
            placeholder={placeholders[i] ?? 'Another perk'}
            maxLength={200}
            onChange={(e) => update(i, e.target.value)}
            onKeyDown={onKeyDown(i)}
          />
          <Button
            type="button"
            variant="ghost"
            size="icon"
            aria-label={`Remove perk ${i + 1}`}
            onClick={() => remove(i)}
            disabled={items.length === 1 && perk === ''}
          >
            <X className="h-4 w-4" />
          </Button>
        </div>
      ))}
      <Button type="button" variant="outline" size="sm" onClick={() => insertAfter(items.length - 1)} disabled={items.length >= 20}>
        <Plus className="mr-1 h-4 w-4" /> Add point
      </Button>
    </div>
  );
}
