import { forwardRef, useState } from "react";
import { Input } from "@/components/ui/input";

interface CurrencyInputProps extends Omit<React.InputHTMLAttributes<HTMLInputElement>, "onChange" | "value"> {
  value: number;
  onChange: (value: number) => void;
  prefix?: string;
}

export const CurrencyInput = forwardRef<HTMLInputElement, CurrencyInputProps>(
  ({ value, onChange, prefix = "R$ ", ...props }, ref) => {
    const [display, setDisplay] = useState(
      value > 0 ? value.toLocaleString("pt-BR", { minimumFractionDigits: 2 }) : ""
    );

    return (
      <Input
        ref={ref}
        {...props}
        value={display}
        placeholder={prefix + "0,00"}
        onChange={(e) => {
          const raw = e.target.value.replace(/\D/g, "");
          const num = parseFloat(raw) / 100 || 0;
          setDisplay(raw ? num.toLocaleString("pt-BR", { minimumFractionDigits: 2 }) : "");
          onChange(num);
        }}
        onFocus={(e) => {
          if (display === "0" || display === "0,00") setDisplay("");
        }}
        onBlur={() => {
          if (value > 0) setDisplay(value.toLocaleString("pt-BR", { minimumFractionDigits: 2 }));
          else setDisplay("");
        }}
      />
    );
  }
);
CurrencyInput.displayName = "CurrencyInput";