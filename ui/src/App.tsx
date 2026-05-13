import { useState } from 'react';
import { TokenGate } from './components/TokenGate.js';
import { ConversationSidebar } from './components/ConversationSidebar.js';
import { ChatPane } from './components/ChatPane.js';

export function App(): JSX.Element {
  const [selected, setSelected] = useState<string | null>(null);

  return (
    <TokenGate>
      <div className="flex h-full min-h-0 w-full">
        <ConversationSidebar selectedId={selected} onSelect={setSelected} />
        <ChatPane conversationId={selected} />
      </div>
    </TokenGate>
  );
}
