import { useState } from "react";

export interface GreetingProps {
  /** Who is greeted. */
  name: string;
  /** Called with the greeting, as it's said. */
  onGreet?: (greeting: string) => void;
}

/** A button that says hello to `name`. */
export const Greeting = ({ name, onGreet }: GreetingProps) => {
  const [greeting, setGreeting] = useState<string>();
  const greet = () => {
    const text = `Hello, ${name}!`;
    setGreeting(text);
    onGreet?.(text);
  };
  return (
    <div>
      <button type="button" onClick={greet}>
        Say hello
      </button>
      {greeting && <p>{greeting}</p>}
    </div>
  );
};
