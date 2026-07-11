import { useState } from "react";

interface CounterProps {
  initialValue?: number;
  step?: number;
}

export function Counter({ initialValue = 0, step = 1 }: CounterProps) {
  const [count, setCount] = useState(initialValue);

  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        gap: "12px",
        fontFamily: "sans-serif",
      }}
    >
      <button
        aria-label="decrement"
        onClick={() => setCount((c) => c - step)}
        style={{ width: 32, height: 32, fontSize: 18, cursor: "pointer" }}
      >
        −
      </button>
      <span
        data-testid="count"
        style={{ fontSize: 24, minWidth: 40, textAlign: "center" }}
      >
        {count}
      </span>
      <button
        aria-label="increment"
        onClick={() => setCount((c) => c + step)}
        style={{ width: 32, height: 32, fontSize: 18, cursor: "pointer" }}
      >
        +
      </button>
      <button
        aria-label="reset"
        onClick={() => setCount(initialValue)}
        style={{ marginLeft: 8, fontSize: 12, cursor: "pointer" }}
      >
        reset
      </button>
    </div>
  );
}
