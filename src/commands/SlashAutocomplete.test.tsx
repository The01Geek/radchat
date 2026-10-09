import { useRef } from 'react';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import { SlashAutocomplete } from './SlashAutocomplete';
import { BUILT_IN_COMMANDS } from './registry';

function Harness() {
  const ref = useRef<HTMLDivElement>(null);
  return (
    <div ref={ref}>
      <input className="react-chatbot-kit-chat-input" aria-label="message" />
      <SlashAutocomplete rootRef={ref} commands={BUILT_IN_COMMANDS} />
    </div>
  );
}

describe('SlashAutocomplete', () => {
  it('suggests commands and completes with Tab', async () => {
    const user = userEvent.setup();
    render(<Harness />);
    const input = screen.getByLabelText('message') as HTMLInputElement;

    await user.type(input, '/he');
    expect(await screen.findByRole('option', { name: /\/help/ })).toBeInTheDocument();

    await user.keyboard('{Tab}');
    expect(input.value).toBe('/help ');
    expect(screen.queryByRole('listbox')).not.toBeInTheDocument();
  });

  it('moves the selection with arrow keys and hides on Escape', async () => {
    const user = userEvent.setup();
    render(<Harness />);
    const input = screen.getByLabelText('message');

    await user.type(input, '/');
    const options = await screen.findAllByRole('option');
    expect(options[0]).toHaveAttribute('aria-selected', 'true');
    await user.keyboard('{ArrowDown}');
    expect(screen.getAllByRole('option')[1]).toHaveAttribute('aria-selected', 'true');
    await user.keyboard('{Escape}');
    expect(screen.queryByRole('listbox')).not.toBeInTheDocument();
  });

  it('stays hidden for normal text', async () => {
    const user = userEvent.setup();
    render(<Harness />);
    await user.type(screen.getByLabelText('message'), 'hello /help');
    expect(screen.queryByRole('listbox')).not.toBeInTheDocument();
  });
});
