import React, { useState, useRef, useEffect } from 'react';
import { GoogleGenAI, GenerateContentResponse } from "@google/genai";
import { Send, X, Bot, User, Loader2 } from 'lucide-react';
import ReactMarkdown from 'react-markdown';

export function Chatbot({ onClose }: { onClose: () => void }) {
  const [messages, setMessages] = useState<{ role: 'user' | 'model', text: string }[]>([
    { role: 'model', text: 'નમસ્તે! હું ફ્રેશ ફાર્મ આસિસ્ટન્ટ છું. હું તમને શાકભાજીની પસંદગી, રેસિપી અથવા એપના ઉપયોગમાં મદદ કરી શકું છું. હું તમારી શું સેવા કરી શકું?' }
  ]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages]);

  const handleSend = async () => {
    if (!input.trim() || loading) return;

    const userMsg = input.trim();
    setInput('');
    setMessages(prev => [...prev, { role: 'user', text: userMsg }]);
    setLoading(true);

    try {
      const apiKey = typeof process !== 'undefined' ? process.env.GEMINI_API_KEY : (import.meta as any).env.VITE_GEMINI_API_KEY;
      if (!apiKey) {
        throw new Error('Gemini API key is not configured');
      }
      const ai = new GoogleGenAI({ apiKey });
      const chat = ai.chats.create({
        model: "gemini-2.0-flash",
        config: {
          systemInstruction: "You are 'Veggie Buddy', a helpful assistant for 'Farm Fresh' (formerly Fresh Farm), a premium vegetable delivery app. You speak Gujarati and English fluently. Help users with vegetable selection, nutritional benefits, and simple Gujarati recipes. Be polite, encouraging, and use food emojis. Emphasize that the vegetables are organic and direct from farmers. The theme of the app is 'Rolling Veg' and focus on freshness. DO NOT speak Hindi as it has been removed from the platform.",
        },
      });

      // Send history
      const response = await chat.sendMessage({ message: userMsg });
      const text = response.text || "માફ કરશો, હું અત્યારે જવાબ આપી શકતો નથી.";
      
      setMessages(prev => [...prev, { role: 'model', text }]);
    } catch (error) {
      console.error('Chat error:', error);
      setMessages(prev => [...prev, { role: 'model', text: "કંઈક ભૂલ થઈ છે. કૃપા કરીને ફરી પ્રયાસ કરો." }]);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="bg-white rounded-[24px] shadow-2xl border border-farm-border flex flex-col h-full overflow-hidden">
      <div className="bg-gradient-to-r from-farm-g1 to-farm-g2 p-4 text-white flex justify-between items-center shadow-lg">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 bg-farm-s2/20 rounded-xl flex items-center justify-center border border-farm-s2/30">
            <Bot className="h-6 w-6 text-farm-s2" />
          </div>
          <div>
            <h2 className="text-sm font-black font-syne italic leading-none">Veggie Buddy</h2>
            <span className="text-[8px] font-bold text-farm-s2 uppercase tracking-[0.2em] animate-pulse">Online Assistant</span>
          </div>
        </div>
        <button onClick={onClose} className="w-8 h-8 flex items-center justify-center hover:bg-white/10 rounded-full transition-colors border border-white/10">
          <X className="h-4 w-4" />
        </button>
      </div>

      <div ref={scrollRef} className="flex-1 overflow-y-auto p-5 space-y-6 bg-farm-cream no-scrollbar pb-10">
        {messages.map((msg, i) => (
          <div key={i} className={`flex ${msg.role === 'user' ? 'justify-end pl-10' : 'justify-start pr-10'}`}>
            <div className={`p-4 rounded-[22px] text-sm shadow-sm relative gu ${
              msg.role === 'user' 
                ? 'bg-farm-g1 text-white rounded-tr-none' 
                : 'bg-white text-farm-g1 rounded-tl-none border border-farm-border'
            }`}>
              <div className="prose prose-sm max-w-none prose-green">
                <ReactMarkdown>{msg.text}</ReactMarkdown>
              </div>
              <div className={`absolute top-0 w-3 h-3 ${msg.role === 'user' ? '-right-1.5 bg-farm-g1' : '-left-1.5 bg-white border-t border-l border-farm-border'} rotate-45`} />
            </div>
          </div>
        ))}
        {loading && (
          <div className="flex justify-start">
             <div className="bg-white p-4 rounded-full rounded-tl-none border border-farm-border shadow-sm flex items-center gap-2">
                <Loader2 className="h-4 w-4 animate-spin text-farm-g2" />
                <span className="text-[10px] font-black text-farm-muted uppercase tracking-widest">Thinking...</span>
             </div>
          </div>
        )}
      </div>

      <div className="p-4 bg-white border-t border-farm-border">
        <div className="flex gap-2 items-center bg-farm-cream p-1.5 rounded-[20px] border border-farm-border">
          <input
            type="text"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && handleSend()}
            placeholder="સંદેશ લખો..."
            className="flex-1 px-4 py-2 bg-transparent outline-none text-sm font-bold text-farm-g1 placeholder:text-farm-muted/50 gu"
          />
          <button
            onClick={handleSend}
            disabled={loading}
            className="w-10 h-10 bg-farm-g1 text-farm-s2 rounded-[14px] flex items-center justify-center hover:bg-farm-g2 transition-all disabled:opacity-50 shadow-lg active:scale-95"
          >
            <Send className="h-5 w-5" />
          </button>
        </div>
      </div>
    </div>
  );
}
