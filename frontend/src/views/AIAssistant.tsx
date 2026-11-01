// AIAssistant view = AI chat panel at full width.
// Full-featured chat lives in components/chat/AIChat.tsx (migrated from legacy
// react-ai-chat.tsx — all 576 LOC of thread management + rate limits).

import AIChat from '../components/chat/AIChat';

export default function AIAssistant() {
    return (
        <div className="ai-assistant-view" style={{ height: '100%' }}>
            <AIChat />
        </div>
    );
}
