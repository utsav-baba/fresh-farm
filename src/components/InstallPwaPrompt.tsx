import React, { useState, useEffect } from 'react';
import { Download, X, Smartphone, CheckCircle, ArrowRight } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';

interface InstallPwaPromptProps {
  user: any;
  profile: any;
}

export const InstallPwaPrompt: React.FC<InstallPwaPromptProps> = ({ user, profile }) => {
  const [deferredPrompt, setDeferredPrompt] = useState<any>(null);
  const [showPrompt, setShowPrompt] = useState(false);
  const [isInstalled, setIsInstalled] = useState(false);

  useEffect(() => {
    // Check if app is already installed
    if (window.matchMedia('(display-mode: standalone)').matches) {
      setIsInstalled(true);
    }

    const handleBeforeInstallPrompt = (e: any) => {
      // Prevent the mini-infobar from appearing on mobile
      e.preventDefault();
      // Stash the event so it can be triggered later.
      setDeferredPrompt(e);
      
      // Determine if we should show our custom prompt
      // Rule: User is logged in, and hasn't seen it recently (could use localStorage)
      const hasDismissed = localStorage.getItem('pwa_prompt_dismissed');
      if (user && profile && !isInstalled && !hasDismissed) {
        setShowPrompt(true);
      }
    };

    const handleAppInstalled = () => {
      setIsInstalled(true);
      setShowPrompt(false);
      setDeferredPrompt(null);
      console.log('PWA was installed');
    };

    window.addEventListener('beforeinstallprompt', handleBeforeInstallPrompt);
    window.addEventListener('appinstalled', handleAppInstalled);

    // If the prompt was already captured but we didn't show it (e.g. login happened after prompt)
    if (user && profile && deferredPrompt && !isInstalled && !localStorage.getItem('pwa_prompt_dismissed')) {
      setShowPrompt(true);
    }

    return () => {
      window.removeEventListener('beforeinstallprompt', handleBeforeInstallPrompt);
      window.removeEventListener('appinstalled', handleAppInstalled);
    };
  }, [user, profile, isInstalled]);

  // Show prompt if user logs in after the event fired
  useEffect(() => {
    if (user && profile && deferredPrompt && !isInstalled && !localStorage.getItem('pwa_prompt_dismissed')) {
      setShowPrompt(true);
    }
  }, [user, profile, deferredPrompt, isInstalled]);

  const handleInstallClick = async () => {
    if (!deferredPrompt) return;

    // Show the browser's install prompt
    deferredPrompt.prompt();

    // Wait for the user to respond to the prompt
    const { outcome } = await deferredPrompt.userChoice;
    console.log(`User response to the install prompt: ${outcome}`);

    // We've used the prompt, and can't use it again, throw it away
    setDeferredPrompt(null);
    setShowPrompt(false);
  };

  const handleDismiss = () => {
    setShowPrompt(false);
    // Don't show again for 7 days
    localStorage.setItem('pwa_prompt_dismissed', Date.now().toString());
  };

  if (isInstalled) return null;

  return (
    <AnimatePresence>
      {showPrompt && (
        <motion.div
          initial={{ y: 100, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          exit={{ y: 100, opacity: 0 }}
          className="fixed bottom-20 left-4 right-4 z-[60] sm:left-auto sm:right-6 sm:bottom-6 sm:w-80"
        >
          <div className="bg-farm-g1 rounded-[32px] p-6 shadow-2xl border border-farm-g3/30 relative overflow-hidden group">
            {/* Background Accent */}
            <div className="absolute -top-10 -right-10 w-32 h-32 bg-farm-s2/20 rounded-full blur-3xl group-hover:scale-150 transition-transform duration-700" />
            
            <button 
              onClick={handleDismiss}
              className="absolute top-4 right-4 text-white/40 hover:text-white transition-colors"
            >
              <X className="h-5 w-5" />
            </button>

            <div className="flex flex-col items-center text-center">
              <div className="w-16 h-16 bg-farm-s2 rounded-[22px] flex items-center justify-center mb-4 shadow-lg shadow-farm-green/30 rotate-3 group-hover:rotate-0 transition-transform">
                <Smartphone className="h-8 w-8 text-farm-g1" />
              </div>

              <h4 className="text-white font-black text-lg mb-1 font-syne uppercase tracking-tight italic">
                Install <span className="text-farm-s2">Fresh Farm</span>
              </h4>
              <p className="text-white/60 text-[10px] font-bold uppercase tracking-widest mb-6">
                Fast, Easy & Always Fresh
              </p>

              <div className="space-y-2 mb-6 w-full">
                {[
                  'Quick Ordering',
                  'Exclusive Offers',
                  'Live Tracking'
                ].map((feature, i) => (
                  <div key={i} className="flex items-center gap-2 text-[10px] text-white/50 font-black uppercase tracking-widest bg-white/5 py-2 px-3 rounded-xl border border-white/5">
                    <CheckCircle className="h-3 w-3 text-farm-s2" />
                    {feature}
                  </div>
                ))}
              </div>

              <button
                onClick={handleInstallClick}
                className="w-full bg-white text-farm-g1 py-4 rounded-[18px] font-black text-[11px] uppercase tracking-[0.2em] shadow-xl hover:bg-farm-s2 transition-all flex items-center justify-center gap-2 group/btn"
              >
                Install App
                <ArrowRight className="h-3 w-3 group-hover/btn:translate-x-1 transition-transform" />
              </button>
            </div>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
};
