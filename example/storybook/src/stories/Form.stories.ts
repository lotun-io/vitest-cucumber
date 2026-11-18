import type { Meta } from '@storybook/react-vite';

import { fn } from 'storybook/test';

import { Form } from './Form';

// The stories file of `Form.feature`, next to it: its meta is the scenario's story, `onSubmit` a spy
// its steps check.
const meta = {
  title: 'Example/Form',
  component: Form,
  parameters: { layout: 'centered' },
  args: { onSubmit: fn() },
} satisfies Meta<typeof Form>;

export default meta;
