import { useEffect, useState } from 'react';

export function useTimeout(delay: number, _resetTrigger?: number): boolean {
  const [isElapsed, setIsElapsed] = useState(false);

  useEffect(() => {
    setIsElapsed(false);
    const timer = setTimeout(setIsElapsed, delay, true);

    return () => clearTimeout(timer);
  }, [delay]);

  return isElapsed;
}
