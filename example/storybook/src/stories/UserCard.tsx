import { useState } from 'react';

interface User {
  name: string;
  email: string;
}

/** A user's card: loads `/api/user` when asked. */
export const UserCard = () => {
  const [user, setUser] = useState<User>();
  const load = async () => {
    const response = await fetch('/api/user');
    setUser((await response.json()) as User);
  };
  return (
    <div>
      <button type="button" onClick={() => void load()}>
        Load user
      </button>
      {user && (
        <p>
          {user.name} ({user.email})
        </p>
      )}
    </div>
  );
};
