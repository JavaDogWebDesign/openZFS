import { useState } from "react";
import { ChevronRight, ChevronDown } from "lucide-react";
import css from "./AdvancedOptions.module.css";

interface Props {
  label?: string;
  defaultOpen?: boolean;
  children: React.ReactNode;
}

export function AdvancedOptions({
  label = "Advanced Options",
  defaultOpen = false,
  children,
}: Props) {
  const [open, setOpen] = useState(defaultOpen);

  return (
    <div>
      <button
        type="button"
        className={css.toggle}
        onClick={() => setOpen((o) => !o)}
      >
        {open ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
        {label}
      </button>
      {open && <div className={css.content}>{children}</div>}
    </div>
  );
}
