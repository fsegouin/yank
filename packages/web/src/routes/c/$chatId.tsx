import { createFileRoute } from '@tanstack/react-router';
import { ChatView } from '../../components/chat-view.js';

export const Route = createFileRoute('/c/$chatId')({
  component: () => {
    const { chatId } = Route.useParams();
    return <ChatView chatId={chatId} />;
  },
});
