import { useEffect, useState } from 'react';

export type ToastType = 'success' | 'error' | 'info';

interface ToastMessage {
  id: number;
  type: ToastType;
  message: string;
}

let toastId = 0;
const listeners = new Set<(msg: ToastMessage) => void>();

function notify(type: ToastType, message: string) {
  const msg: ToastMessage = { id: ++toastId, type, message };
  listeners.forEach((fn) => fn(msg));
}

export const toast = {
  success: (msg: string) => notify('success', msg),
  error: (msg: string) => notify('error', msg),
  info: (msg: string) => notify('info', msg),
};

const typeStyles: Record<ToastType, string> = {
  success: 'bg-teal text-white',
  error: 'bg-red-500 text-white',
  info: 'bg-accent text-white',
};

function ToastItem({ msg, onDone }: { msg: ToastMessage; onDone: () => void }) {
  useEffect(() => {
    const timer = setTimeout(onDone, 3000);
    return () => clearTimeout(timer);
  }, [onDone]);

  return (
    <div
      className={`${typeStyles[msg.type]} px-4 py-2 rounded-md shadow-card font-body text-sm animate-in fade-in slide-in-from-top-2 duration-200`}
    >
      {msg.message}
    </div>
  );
}

export default function ToastContainer() {
  const [messages, setMessages] = useState<ToastMessage[]>([]);

  useEffect(() => {
    const handler = (msg: ToastMessage) => {
      setMessages((prev) => [...prev, msg]);
    };
    listeners.add(handler);
    return () => {
      listeners.delete(handler);
    };
  }, []);

  const remove = (id: number) => {
    setMessages((prev) => prev.filter((m) => m.id !== id));
  };

  if (messages.length === 0) return null;

  return (
    <div className="fixed top-20 right-4 z-[60] flex flex-col gap-2">
      {messages.map((msg) => (
        <ToastItem key={msg.id} msg={msg} onDone={() => remove(msg.id)} />
      ))}
    </div>
  );
}
