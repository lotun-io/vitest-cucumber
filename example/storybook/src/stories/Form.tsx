import { useState, type FormEvent } from 'react';

export interface FormValues {
  name: string;
  email: string;
  role: string;
  notes: string;
}

export interface FormProps {
  /** Called with the form's values when it's submitted. */
  onSubmit?: (values: FormValues) => void;
}

/** A sign-up form: a name, an email, a role and notes. */
export const Form = ({ onSubmit }: FormProps) => {
  const [submitted, setSubmitted] = useState<string>();
  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    const values = {
      name: String(data.get('name')),
      email: String(data.get('email')),
      role: String(data.get('role')),
      notes: String(data.get('notes')),
    };
    onSubmit?.(values);
    setSubmitted(values.name);
  };
  return (
    <form onSubmit={submit} style={{ display: 'grid', gap: 8, maxWidth: 320 }}>
      <label>
        Name <input name="name" />
      </label>
      <label>
        Email <input name="email" type="email" />
      </label>
      <label>
        Role{' '}
        <select name="role" defaultValue="viewer">
          <option value="viewer">viewer</option>
          <option value="editor">editor</option>
          <option value="admin">admin</option>
        </select>
      </label>
      <label>
        Notes <textarea name="notes" />
      </label>
      <button type="submit">Submit</button>
      {submitted && <p>Thanks, {submitted}!</p>}
    </form>
  );
};
