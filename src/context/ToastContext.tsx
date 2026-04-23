import React, { createContext, useContext, useState, useCallback } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { AlertCircle, CheckCircle, Info, X } from 'lucide-react';

type ToastType = 'success' | 'error' | 'info';

interface Toast {
  id: string;
  message: string;
  type: ToastType;
}

interface ToastContextType {
  showToast: (message: string, type?: ToastType) => void;
}

const ToastContext = createContext<ToastContextType | undefined>(undefined);

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);

  const showToast = useCallback((message: string, type: ToastType = 'info') => {
    const id = Date.now().toString();
    setToasts(prev => [...prev, { id, message, type }]);
    
    // Auto-remove after 4 seconds
    setTimeout(() => {
      setToasts(prev => prev.filter(t => t.id !== id));
    }, 4000);
  }, []);

  const removeToast = (id: string) => {
    setToasts(prev => prev.filter(t => t.id !== id));
  };

  return (
    <ToastContext.Provider value={{ showToast }}>
      {children}
      <div className="fixed bottom-20 left-1/2 -translate-x-1/2 z-[300] flex flex-col items-center gap-3 w-full px-6 pointer-events-none">
        <AnimatePresence>
          {toasts.map(toast => (
            <motion.div
              key={toast.id}
              initial={{ opacity: 0, y: 50, scale: 0.9 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: 20, scale: 0.9 }}
              className={`
                flex items-center gap-3 px-6 py-4 rounded-2xl shadow-2xl border-4 border-white pointer-events-auto max-w-sm w-full
                ${toast.type === 'error' ? 'bg-red-600 text-white' : 
                  toast.type === 'success' ? 'bg-green-600 text-white' : 
                  'bg-slate-800 text-white'}
              `}
            >
              {toast.type === 'error' ? <AlertCircle className="h-6 w-6 shrink-0" /> : 
               toast.type === 'success' ? <CheckCircle className="h-6 w-6 shrink-0" /> : 
               <Info className="h-6 w-6 shrink-0" />}
              
              <span className="font-black text-sm leading-tight flex-1">{toast.message}</span>
              
              <button 
                onClick={() => removeToast(toast.id)}
                className="p-1 hover:bg-white/20 rounded-lg transition-colors"
              >
                <X className="h-4 w-4" />
              </button>
            </motion.div>
          ))}
        </AnimatePresence>
      </div>
    </ToastContext.Provider>
  );
}

export function useToast() {
  const context = useContext(ToastContext);
  if (context === undefined) {
    throw new Error('useToast must be used within a ToastProvider');
  }
  return context;
}
