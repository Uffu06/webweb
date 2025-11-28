interface DayPickerProps {
  selectedDays: number[]
  onChange: (days: number[]) => void
  label?: string
  helperText?: string
}

const DAY_LABELS = ['Mo', 'Di', 'Mi', 'Do', 'Fr', 'Sa', 'So']

export default function DayPicker({
  selectedDays,
  onChange,
  label = 'Tage auswählen',
  helperText
}: DayPickerProps) {
  const toggleDay = (index: number) => {
    if (selectedDays.includes(index)) {
      onChange(selectedDays.filter(d => d !== index))
    } else {
      onChange([...selectedDays, index].sort())
    }
  }

  return (
    <div className="w-full rounded-2xl bg-zinc-900 px-3 py-3 text-sm text-zinc-100">
      <div className="mb-2 text-xs font-medium text-zinc-200">
        {label}
      </div>

      <div className="flex flex-wrap gap-2">
        {DAY_LABELS.map((text, index) => {
          const isSelected = selectedDays.includes(index)
          return (
            <button
              key={text}
              type="button"
              onClick={() => toggleDay(index)}
              className={`flex h-10 min-w-[44px] flex-1 items-center justify-center rounded-full px-3 text-sm font-semibold ${
                isSelected
                  ? 'bg-sky-400 text-black'
                  : 'bg-zinc-700 text-zinc-100'
              }`}
            >
              {text}
            </button>
          )
        })}
      </div>

      {helperText && (
        <div className="mt-2 text-[11px] text-zinc-400">
          {helperText}
        </div>
      )}
    </div>
  )
}
