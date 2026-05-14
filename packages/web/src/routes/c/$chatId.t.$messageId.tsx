import { createFileRoute } from '@tanstack/react-router';
import { useEffect } from 'react';
import { ChatView } from '../../components/chat/ChatView.js';
import { useUiStore } from '../../state/ui.js';

export const Route = createFileRoute('/c/$chatId/t/$messageId')({
  component: () => {
    const { chatId, messageId } = Route.useParams();
    const openThread = useUiStore((s) => s.openThread);
    useEffect(() => {
      openThread(messageId);
    }, [messageId, openThread]);
    return <ChatView chatId={chatId} />;
  },
});
