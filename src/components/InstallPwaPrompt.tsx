import React, { useState, useEffect } from 'react';
import { Download, X, Smartphone, CheckCircle, ArrowRight, Share, Info } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';

interface InstallPwaPromptProps {
  user: any;
  profile: any;
}

export const InstallPwaPrompt: React.FC<InstallPwaPromptProps> = ({ user, profile }) => {
  const [deferredPrompt, setDeferredPrompt] = useState<any>(null);
  const [showPrompt, setShowPrompt] = useState(false);
  const [isInstalled, setIsInstalled] = useState(false);
  const [isIOS, setIsIOS] = useState(false);
  const [isInIframe, setIsInIframe] = useState(false);

  useEffect(() => {
    // Check if app is already installed/running in standalone mode
    const isStandalone = window.matchMedia('(display-mode: standalone)').matches || (window.navigator as any).standalone;
    setIsInstalled(isStandalone);

    // Detect if running in iframe (AI Studio preview)
    setIsInIframe(window.self !== window.top);

    // Detect iOS
    const isIOSDevice = /iPad|iPhone|iPod/.test(navigator.userAgent) && !(window as any).MSStream;
    setIsIOS(isIOSDevice);

    const handleBeforeInstallPrompt = (e: any) => {
      // Prevent the mini-infobar from appearing on mobile
      e.preventDefault();
      // Stash the event so it can be triggered later.
      setDeferredPrompt(e);
      
      const hasDismissed = localStorage.getItem('pwa_prompt_dismissed');
      // If user is logged in, not already in standalone mode, and hasn't dismissed, show it
      if (user && profile && !isStandalone && !hasDismissed) {
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

    // Initial check for iOS or if engagement is already high
    if (user && profile && !isStandalone && !localStorage.getItem('pwa_prompt_dismissed')) {
      // Small delay to let app load
      const timer = setTimeout(() => {
        // Show if iOS or if we have the prompt
        if (isIOSDevice || deferredPrompt) {
          setShowPrompt(true);
        } else if (!isStandalone) {
          // Even if we don't have the event yet, we can show instructions for manual installation
          // but maybe wait a bit more for Chrome to fire the event
          setShowPrompt(true);
        }
      }, 3000);
      return () => clearTimeout(timer);
    }

    return () => {
      window.removeEventListener('beforeinstallprompt', handleBeforeInstallPrompt);
      window.removeEventListener('appinstalled', handleAppInstalled);
    };
  }, [user, profile, isInstalled, deferredPrompt, isIOS]);

  const handleInstallClick = async () => {
    if (isIOS) return;

    if (!deferredPrompt) {
      // If we don't have the prompt event, show manual instructions
      alert("તમારા બ્રાઉઝર સેટિંગ્સમાં જાઓ અને 'Install App' અથવા 'Add to Home Screen' પસંદ કરો.");
      return;
    }

    deferredPrompt.prompt();
    const { outcome } = await deferredPrompt.userChoice;
    setDeferredPrompt(null);
    setShowPrompt(false);
  };

  const handleDismiss = () => {
    setShowPrompt(false);
    localStorage.setItem('pwa_prompt_dismissed', Date.now().toString());
  };

  if (isInstalled || isInIframe) return null;

  return (
    <AnimatePresence>
      {showPrompt && (
        <motion.div
          initial={{ y: 100, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          exit={{ y: 100, opacity: 0 }}
          className="fixed bottom-20 left-4 right-4 z-[100] sm:left-auto sm:right-6 sm:bottom-6 sm:w-80"
        >
          <div className="bg-farm-g1 rounded-[32px] p-6 shadow-2xl border border-farm-g3/30 relative overflow-hidden group">
            <div className="absolute -top-10 -right-10 w-32 h-32 bg-farm-s2/20 rounded-full blur-3xl group-hover:scale-150 transition-transform duration-700" />
            
            <button 
              onClick={handleDismiss}
              className="absolute top-4 right-4 text-white/40 hover:text-white transition-colors z-10"
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
                App List માં Fresh Farm ઉમેરો
              </p>

              {isIOS ? (
                <div className="space-y-4 w-full text-left">
                  <div className="bg-white/5 p-4 rounded-2xl border border-white/10">
                    <p className="text-[10px] text-white/70 font-bold uppercase tracking-widest mb-3 leading-relaxed">
                      iOS પર ઇન્સ્ટોલ કરવા માટે:
                    </p>
                    <ol className="space-y-3">
                      <li className="flex items-center gap-3 text-[11px] text-white font-black">
                        <span className="w-5 h-5 rounded-full bg-farm-s2 text-farm-g1 flex items-center justify-center text-[10px]">1</span>
                        <div className="flex items-center gap-2">
                          નીચે <Share className="h-4 w-4 text-farm-s2" /> બટન દબાવો
                        </div>
                      </li>
                      <li className="flex items-center gap-3 text-[11px] text-white font-black">
                        <span className="w-5 h-5 rounded-full bg-farm-s2 text-farm-g1 flex items-center justify-center text-[10px]">2</span>
                        'Add to Home Screen' પસંદ કરો
                      </li>
                    </ol>
                  </div>
                  <button
                    onClick={handleDismiss}
                    className="w-full bg-white text-farm-g1 py-4 rounded-[18px] font-black text-[11px] uppercase tracking-[0.2em] shadow-xl"
                  >
                    સમજાયું (Got it)
                  </button>
                </div>
              ) : (
                <>
                  <div className="bg-white/5 p-4 rounded-2xl border border-white/10 mb-6 w-full text-left">
                    <div className="flex items-start gap-2 mb-2">
                      <Info className="h-4 w-4 text-farm-s2 shrink-0 mt-0.5" />
                      <p className="text-[10px] text-white/90 font-bold uppercase tracking-widest">ઝડપથી વાપરવા માટે:</p>
                    </div>
                    <p className="text-[9px] text-white/50 font-medium leading-relaxed">
                      આ એપને તમારી હોમ સ્ક્રીન પર ઉમેરો જેથી તમે એક ક્લિકમાં ઓર્ડર કરી શકો.
                    </p>
                  </div>

                  <button
                    onClick={handleInstallClick}
                    className="w-full bg-white text-farm-g1 py-4 rounded-[18px] font-black text-[11px] uppercase tracking-[0.2em] shadow-xl hover:bg-farm-s2 transition-all flex items-center justify-center gap-2 group/btn"
                  >
                    Install App
                    <ArrowRight className="h-3 w-3 group-hover/btn:translate-x-1 transition-transform" />
                  </button>
                </>
              )}
            </div>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
};
