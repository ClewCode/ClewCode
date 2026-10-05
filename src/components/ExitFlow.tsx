import { gracefulShutdown } from '../utils/gracefulShutdown.js';
import { WorktreeExitDialog } from './WorktreeExitDialog.js';

const GOODBYE_MESSAGES = ['Goodbye!', 'See ya!', 'Bye!', 'Catch you later!'];

function getRandomGoodbyeMessage(): string {
  return GOODBYE_MESSAGES[Math.floor(Math.random() * GOODBYE_MESSAGES.length)] ?? 'Goodbye!';
}

type Props = {
  onDone: (message?: string) => void;
  onCancel?: () => void;
  showWorktree: boolean;
};

export function ExitFlow({ showWorktree, onDone, onCancel }: Props): React.ReactNode {
  async function onExit(resultMessage?: string) {
    onDone(resultMessage ?? getRandomGoodbyeMessage());
    await gracefulShutdown(0, 'prompt_input_exit');
  }

  if (showWorktree) {
    return <WorktreeExitDialog onDone={onExit} onCancel={onCancel} />;
  }

  return null;
}
