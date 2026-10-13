import React, { useEffect, useState } from 'react';
import { AviatorOfficialLogo } from '../utils/logoImage';

interface AviatorSplashScreenProps {
  isReady: boolean;
  onFinish: () => void;
  minDisplayTimeMs?: number;
}

export const AviatorSplashScreen: React.FC<AviatorSplashScreenProps> = ({
  isReady,
  onFinish,
  minDisplayTimeMs = 1500,
}) => {
  const [isMounted, setIsMounted] = useState<boolean>(false);
  const [progress, setProgress] = useState<number>(12);
  const [statusText, setStatusText] = useState<string>('Initializing systems...');
  const [isFadingOut, setIsFadingOut] = useState<boolean>(false);
  const [minTimeElapsed, setMinTimeElapsed] = useState<boolean>(false);

  // Trigger smooth entrance animation on mount
  useEffect(() => {
    const mountTimer = setTimeout(() => {
      setIsMounted(true);
    }, 40);
    return () => clearTimeout(mountTimer);
  }, []);

  // Minimum display time enforcement so splash animation is smooth and discernible
  useEffect(() => {
    const timer = setTimeout(() => {
      setMinTimeElapsed(true);
    }, minDisplayTimeMs);
    return () => clearTimeout(timer);
  }, [minDisplayTimeMs]);

  // Progressive simulated boot ticks
  useEffect(() => {
    const interval = setInterval(() => {
      setProgress((prev) => {
        if (prev < 42) {
          setStatusText('Connecting to radar...');
          return prev + Math.floor(Math.random() * 10 + 6);
        }
        if (prev < 78) {
          setStatusText('Calibrating flight telemetry...');
          return prev + Math.floor(Math.random() * 8 + 5);
        }
        if (prev < 94) {
          setStatusText('Synchronizing provably fair seed...');
          return prev + Math.floor(Math.random() * 4 + 2);
        }
        return prev;
      });
    }, 160);

    return () => clearInterval(interval);
  }, []);

  // When backend is confirmed ready AND minimum display time has elapsed
  useEffect(() => {
    if (isReady && minTimeElapsed) {
      setProgress(100);
      setStatusText('Ready for takeoff');

      // Trigger smooth fade out
      const exitTimer = setTimeout(() => {
        setIsFadingOut(true);
        // After fade out transition finishes, complete unmount
        const finishTimer = setTimeout(() => {
          onFinish();
        }, 700);
        return () => clearTimeout(finishTimer);
      }, 250);

      return () => clearTimeout(exitTimer);
    }
  }, [isReady, minTimeElapsed, onFinish]);

  return (
    <div
      aria-label="Loading Aviator"
      className={`fixed inset-0 z-50 bg-[#070A10] flex flex-col items-center justify-center p-6 select-none overflow-hidden transition-all duration-700 ease-out ${
        isFadingOut
          ? 'opacity-0 scale-105 pointer-events-none'
          : 'opacity-100 scale-100'
      }`}
    >
      {/* Background ambient radial glow */}
      <div
        className="absolute inset-0 pointer-events-none"
        style={{
          background:
            'radial-gradient(circle at 50% 46%, rgba(229, 5, 58, 0.18) 0%, rgba(11, 14, 20, 0.85) 55%, #070A10 100%)',
        }}
      />

      {/* Main Center Content Container */}
      <div
        className={`relative z-10 flex flex-col items-center justify-center max-w-sm w-full transition-all duration-700 ease-out ${
          isMounted
            ? 'opacity-100 scale-100 translate-y-0'
            : 'opacity-0 scale-95 translate-y-3'
        }`}
      >
        {/* Prominent Official Logo with original aspect ratio */}
        <div className="w-56 sm:w-64 md:w-72 max-w-[85vw] aspect-square flex items-center justify-center drop-shadow-[0_12px_40px_rgba(229,5,58,0.4)]">
          <AviatorOfficialLogo
            className="w-full h-full object-contain"
            glow={true}
          />
        </div>

        {/* Subtle, elegant loading indicator */}
        <div className="w-48 sm:w-60 mt-6 sm:mt-8 space-y-2.5 flex flex-col items-center">
          {/* Progress Capsule Bar */}
          <div className="w-full h-1.5 bg-slate-900/90 border border-slate-800 rounded-full overflow-hidden p-0.5">
            <div
              className="h-full bg-gradient-to-r from-rose-600 via-rose-500 to-amber-400 rounded-full transition-all duration-200 ease-out shadow-[0_0_12px_rgba(244,63,94,0.6)]"
              style={{ width: `${Math.min(100, progress)}%` }}
            />
          </div>

          {/* Telemetry Status text */}
          <div className="flex items-center justify-between w-full text-[11px] font-mono text-slate-400">
            <span className="truncate pr-2">{statusText}</span>
            <span className="text-rose-400 font-semibold font-mono-tabular shrink-0">
              {Math.min(100, progress)}%
            </span>
          </div>
        </div>
      </div>
    </div>
  );
};
