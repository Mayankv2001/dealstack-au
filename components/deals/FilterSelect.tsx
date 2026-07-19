"use client";

/**
 * A named <select> that submits its enclosing GET form as soon as the value
 * changes — the visible filters need no separate Apply button. Without
 * JavaScript the surrounding form still submits normally via its (visually
 * hidden) submit button, so nothing breaks.
 */
export function FilterSelect({
  id,
  label,
  name,
  defaultValue,
  children,
}: {
  id: string;
  label: string;
  name: string;
  defaultValue: string | number;
  children: React.ReactNode;
}) {
  return (
    <label className="grid min-w-0 gap-1 text-[11px] font-semibold" htmlFor={id}>
      {label}
      <select
        id={id}
        name={name}
        defaultValue={defaultValue}
        onChange={(event) => event.currentTarget.form?.requestSubmit()}
        className="h-9 min-w-0 rounded-lg border bg-background px-2 text-xs font-medium"
      >
        {children}
      </select>
    </label>
  );
}

export default FilterSelect;
