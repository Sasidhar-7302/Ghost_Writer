import { useState, useEffect } from 'react';

export const usePlatform = () => {
  const [isMac, setIsMac] = useState(false);

  useEffect(() => {
    // Check if we're in the browser environment
    if (typeof window !== 'undefined' && window.navigator && window.navigator.userAgent) {
      setIsMac(/Mac|iPod|iPhone|iPad/.test(window.navigator.userAgent));
    }
  }, []);

  return { isMac };
};
