import { createContext, useContext, useState, type ReactNode } from 'react';
export interface ExplorerClipboard {
  workspaceId: string;
  nodeIds: string[];
  operation: 'copy' | 'move';
}
const ClipboardContext = createContext<{
  clipboard: ExplorerClipboard | null;
  setClipboard: (value: ExplorerClipboard | null) => void;
} | null>(null);
export function ExplorerClipboardProvider({ children }: { children: ReactNode }) {
  const [clipboard, setClipboard] = useState<ExplorerClipboard | null>(null);
  return (
    <ClipboardContext.Provider value={{ clipboard, setClipboard }}>
      {children}
    </ClipboardContext.Provider>
  );
}
export function useExplorerClipboard() {
  const context = useContext(ClipboardContext);
  if (!context) throw new Error('Clipboard provider missing');
  return context;
}
