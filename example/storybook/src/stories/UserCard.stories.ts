import type { Meta, StoryObj } from '@storybook/react-vite';

import { UserCard } from './UserCard';

// The stories file of `UserCard.feature`, next to it: its meta is the scenario's story, its hooks
// around it.
const meta = {
  title: 'Example/UserCard',
  component: UserCard,
  parameters: { layout: 'centered' },
} satisfies Meta<typeof UserCard>;

export default meta;
type Story = StoryObj<typeof meta>;

/** The card before it loads anything: an ordinary story, next to the feature's. */
export const Empty: Story = {};
