import { createFileRoute } from '@tanstack/react-router';
import { ChatView } from '../../components/chat/ChatView.js';

export const Route = createFileRoute('/c/$chatId')({
  component: () => {
    const { chatId } = Route.useParams();
    return <ChatView chatId={chatId} />;
  },
});
