import type { CSSProperties } from "react";

interface ButtonProps {
  label: string;
  variant?: "primary" | "secondary";
  size?: "sm" | "md" | "lg";
  disabled?: boolean;
  onClick?: () => void;
}

const sizeStyles = {
  sm: { padding: "4px 12px", fontSize: "12px" },
  md: { padding: "8px 20px", fontSize: "14px" },
  lg: { padding: "12px 28px", fontSize: "16px" },
};

export function Button({
  label,
  variant = "primary",
  size = "md",
  disabled = false,
  onClick,
}: ButtonProps) {
  const base: CSSProperties = {
    border: "none",
    borderRadius: "4px",
    cursor: disabled ? "not-allowed" : "pointer",
    fontWeight: 600,
    opacity: disabled ? 0.5 : 1,
    ...sizeStyles[size],
    background: variant === "primary" ? "#1ea7fd" : "transparent",
    color: variant === "primary" ? "#fff" : "#1ea7fd",
    outline: variant === "secondary" ? "2px solid #1ea7fd" : "none",
  };

  return (
    <button style={base} disabled={disabled} onClick={onClick}>
      {label}
    </button>
  );
}
