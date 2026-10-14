import React, { useEffect, useRef, useState } from 'react';
import {
  ShieldCheck,
  Volume2,
  VolumeX,
  X,
} from 'lucide-react';
import type { CrashRoundHistoryItem, GameStateResponse } from '../types';
import { soundFx, type AudioSettings } from '../utils/sound';

interface AviatorCanvasProps {
  gameState: GameStateResponse;
}

export const AviatorCanvas: React.FC<AviatorCanvasProps> = ({ gameState }) => {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const [audioSettings, setAudioSettings] = useState<AudioSettings>(() => soundFx.getSettings());
  const [selectedHistoryRound, setSelectedHistoryRound] = useState<CrashRoundHistoryItem | null>(null);

  // Synchronize flight audio strictly with server-authoritative game state
  useEffect(() => {
    soundFx.syncWithGameState(gameState.phase, gameState.roundId);
  }, [gameState.phase, gameState.roundId]);

  // Keep audio settings in sync with soundFx
  useEffect(() => {
    const unsubscribe = soundFx.subscribe((settings) => {
      setAudioSettings(settings);
    });
    return () => {
      unsubscribe();
    };
  }, []);

  const toggleMute = () => {
    soundFx.toggleMute();
  };

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    let animationFrameId: number;
    let startTime = performance.now();

    const renderFrame = (now: number) => {
      const rect = canvas.getBoundingClientRect();
      const dpr = window.devicePixelRatio || 1;
      if (canvas.width !== Math.floor(rect.width * dpr) || canvas.height !== Math.floor(rect.height * dpr)) {
        canvas.width = Math.floor(rect.width * dpr);
        canvas.height = Math.floor(rect.height * dpr);
      }

      ctx.save();
      ctx.scale(dpr, dpr);

      const width = rect.width;
      const height = rect.height;

      // 1. Deep Cockpit Radar Background
      const bgGrad = ctx.createRadialGradient(
        width * 0.5,
        height * 0.65,
        20,
        width * 0.5,
        height * 0.5,
        Math.max(width, height) * 0.85
      );
      if (gameState.phase === 'CRASHED') {
        bgGrad.addColorStop(0, '#1F1218');
        bgGrad.addColorStop(1, '#090C12');
      } else if (gameState.phase === 'FLYING') {
        bgGrad.addColorStop(0, '#231119');
        bgGrad.addColorStop(1, '#0A0D14');
      } else {
        bgGrad.addColorStop(0, '#131824');
        bgGrad.addColorStop(1, '#0A0D14');
      }
      ctx.fillStyle = bgGrad;
      ctx.fillRect(0, 0, width, height);

      // 2. Subtle Radar Grid & Sunburst Rays from Bottom-Left Origin
      const padLeft = 44;
      const padBottom = 36;
      const padTop = 32;
      const padRight = 40;
      const plotW = Math.max(100, width - padLeft - padRight);
      const plotH = Math.max(100, height - padTop - padBottom);
      const originX = padLeft;
      const originY = height - padBottom;

      // Rotating subtle rays from origin
      ctx.save();
      ctx.beginPath();
      ctx.rect(padLeft, padTop, plotW, plotH);
      ctx.clip();

      const rayCount = 14;
      const rotationOffset = gameState.phase === 'FLYING' ? (now - startTime) * 0.00018 : 0;
      ctx.strokeStyle = 'rgba(255, 255, 255, 0.025)';
      ctx.lineWidth = 1;
      for (let i = 0; i < rayCount; i++) {
        const angle = (i / rayCount) * (Math.PI * 0.65) + rotationOffset;
        const rx = originX + Math.cos(angle) * Math.max(width, height) * 1.3;
        const ry = originY - Math.sin(angle) * Math.max(width, height) * 1.3;
        ctx.beginPath();
        ctx.moveTo(originX, originY);
        ctx.lineTo(rx, ry);
        ctx.stroke();
      }

      // Horizontal and Vertical Grid Lines
      ctx.strokeStyle = 'rgba(148, 163, 184, 0.07)';
      ctx.lineWidth = 1;
      const hSteps = 5;
      for (let i = 1; i <= hSteps; i++) {
        const y = originY - (i / hSteps) * plotH;
        ctx.beginPath();
        ctx.moveTo(originX, y);
        ctx.lineTo(originX + plotW, y);
        ctx.stroke();
      }
      const vSteps = 6;
      for (let i = 1; i <= vSteps; i++) {
        const x = originX + (i / vSteps) * plotW;
        ctx.beginPath();
        ctx.moveTo(x, padTop);
        ctx.lineTo(x, originY);
        ctx.stroke();
      }
      ctx.restore();

      // Axis Border Lines
      ctx.strokeStyle = 'rgba(148, 163, 184, 0.22)';
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.moveTo(originX, padTop);
      ctx.lineTo(originX, originY);
      ctx.lineTo(originX + plotW, originY);
      ctx.stroke();

      // Axis Ticks (Dots along X and Y axes)
      const tickOffset = gameState.phase === 'FLYING' ? ((now * 0.04) % 24) : 0;
      ctx.fillStyle = 'rgba(148, 163, 184, 0.35)';
      for (let x = originX + 24 - tickOffset; x < originX + plotW; x += 24) {
        if (x > originX) {
          ctx.beginPath();
          ctx.arc(x, originY + 12, 1.5, 0, Math.PI * 2);
          ctx.fill();
        }
      }
      for (let y = originY - 24 + tickOffset; y > padTop; y -= 24) {
        if (y < originY) {
          ctx.beginPath();
          ctx.arc(originX - 14, y, 1.5, 0, Math.PI * 2);
          ctx.fill();
        }
      }

      // 3. Flight Curve & Animated Airplane
      if (gameState.phase === 'FLYING' || gameState.phase === 'CRASHED') {
        const mult = Math.max(1.0, gameState.multiplier);
        // Normalize progress smoothly between 0.08 and 0.92 of plot area
        const logProgress = Math.min(1, Math.log10(mult) / Math.log10(25));
        const linearBoost = Math.min(0.88, (mult - 1) / 3.5);
        const progress = Math.max(0.06, Math.min(0.92, linearBoost * 0.55 + logProgress * 0.45));

        // Gentle bobbing oscillation when flying at higher multipliers
        const bobX = gameState.phase === 'FLYING' ? Math.sin(now * 0.003) * 4 : 0;
        const bobY = gameState.phase === 'FLYING' ? Math.cos(now * 0.004) * 5 : 0;

        const targetX = originX + plotW * progress + bobX;
        const targetY = originY - plotH * Math.pow(progress, 1.18) + bobY;

        const cpX = originX + (targetX - originX) * 0.58;
        const cpY = originY - (originY - targetY) * 0.14;

        if (gameState.phase === 'FLYING') {
          // Fill area under flight curve
          const areaGrad = ctx.createLinearGradient(originX, targetY, originX, originY);
          areaGrad.addColorStop(0, 'rgba(225, 29, 72, 0.36)');
          areaGrad.addColorStop(0.7, 'rgba(225, 29, 72, 0.10)');
          areaGrad.addColorStop(1, 'rgba(225, 29, 72, 0.01)');

          ctx.beginPath();
          ctx.moveTo(originX, originY);
          ctx.quadraticCurveTo(cpX, cpY, targetX, targetY);
          ctx.lineTo(targetX, originY);
          ctx.closePath();
          ctx.fillStyle = areaGrad;
          ctx.fill();

          // Glowing Crimson Trajectory Curve
          ctx.save();
          ctx.beginPath();
          ctx.moveTo(originX, originY);
          ctx.quadraticCurveTo(cpX, cpY, targetX, targetY);
          ctx.strokeStyle = '#F43F5E';
          ctx.lineWidth = 4;
          ctx.lineCap = 'round';
          ctx.shadowColor = 'rgba(244, 63, 94, 0.75)';
          ctx.shadowBlur = 14;
          ctx.stroke();
          ctx.restore();
        }

        // Compute plane position (if CRASHED, fly plane rapidly up-right off canvas)
        let planeX = targetX;
        let planeY = targetY;
        let planeAngle = -0.34;

        if (gameState.phase === 'FLYING') {
          const dx = targetX - cpX;
          const dy = targetY - cpY;
          planeAngle = Math.atan2(dy, dx);
        } else {
          planeX = targetX + 45;
          planeY = targetY - 35;
          planeAngle = -0.55;
        }

        // Draw Stylized Crimson Aviation Aircraft at (planeX, planeY)
        ctx.save();
        ctx.translate(planeX, planeY);
        ctx.rotate(planeAngle);

        // Jet / Engine Exhaust Flame when flying
        if (gameState.phase === 'FLYING') {
          const flameLen = 18 + Math.sin(now * 0.05) * 6;
          const flameGrad = ctx.createLinearGradient(-22, 0, -22 - flameLen, 0);
          flameGrad.addColorStop(0, '#FDE047');
          flameGrad.addColorStop(0.5, '#F43F5E');
          flameGrad.addColorStop(1, 'rgba(244, 63, 94, 0)');
          ctx.fillStyle = flameGrad;
          ctx.beginPath();
          ctx.moveTo(-20, -4);
          ctx.lineTo(-22 - flameLen, 0);
          ctx.lineTo(-20, 4);
          ctx.closePath();
          ctx.fill();
        }

        // Fuselage Shadow Glow
        ctx.shadowColor = 'rgba(225, 29, 72, 0.85)';
        ctx.shadowBlur = 16;

        // Back Tail Fin
        ctx.fillStyle = '#BE123C';
        ctx.beginPath();
        ctx.moveTo(-22, -2);
        ctx.lineTo(-30, -15);
        ctx.lineTo(-14, -4);
        ctx.closePath();
        ctx.fill();

        // Main Fuselage
        ctx.fillStyle = '#E11D48';
        ctx.beginPath();
        ctx.moveTo(-24, -4);
        ctx.quadraticCurveTo(0, -9, 24, -1);
        ctx.quadraticCurveTo(28, 1, 24, 4);
        ctx.quadraticCurveTo(0, 7, -24, 3);
        ctx.closePath();
        ctx.fill();

        // Cockpit Canopy
        ctx.fillStyle = '#F8FAFC';
        ctx.beginPath();
        ctx.ellipse(4, -3.5, 8, 3.2, -0.1, 0, Math.PI * 2);
        ctx.fill();

        // Swept Forward Wing
        ctx.fillStyle = '#FB7185';
        ctx.beginPath();
        ctx.moveTo(-4, 1);
        ctx.lineTo(-14, 15);
        ctx.lineTo(-3, 15);
        ctx.lineTo(10, 2);
        ctx.closePath();
        ctx.fill();

        // Spinning Front Propeller Blur
        const propScale = Math.abs(Math.sin(now * 0.045));
        ctx.fillStyle = 'rgba(248, 250, 252, 0.85)';
        ctx.beginPath();
        ctx.ellipse(26, 1, 2.2, 11 * propScale + 2, 0, 0, Math.PI * 2);
        ctx.fill();

        ctx.restore();
      }

      ctx.restore();
      animationFrameId = requestAnimationFrame(renderFrame);
    };

    animationFrameId = requestAnimationFrame(renderFrame);
    return () => cancelAnimationFrame(animationFrameId);
  }, [gameState.phase, gameState.multiplier]);

  const countdownSec = (gameState.countdownMs / 1000).toFixed(1);
  const progressPercent = Math.min(100, Math.max(0, (gameState.countdownMs / 5000) * 100));

  return (
    <div className="flex flex-col gap-3">
      {/* Recent Round Multipliers Strip (Interactive buttons to inspect Provably Fair SHA-256 seeds) */}
      <div className="flex items-center justify-between gap-3 bg-[#111622] border border-slate-800/80 rounded-xl px-3.5 py-2 relative">
        <div className="flex items-center gap-2 overflow-x-auto no-scrollbar py-0.5">
          <span className="text-xs font-medium text-slate-400 whitespace-nowrap shrink-0 mr-1">
            Recent Flights:
          </span>
          {gameState.recentHistory.map((item) => {
            const isHigh = item.crashPoint >= 2.0;
            const isMega = item.crashPoint >= 10.0;
            return (
              <button
                key={item.roundId}
                type="button"
                onClick={() => setSelectedHistoryRound(item)}
                title="Click to verify Provably Fair SHA-256 round seed"
                className={`px-2.5 py-1 rounded-md text-xs font-mono-tabular font-semibold transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                  isMega
                    ? 'bg-amber-500/15 text-amber-300 hover:bg-amber-500/25 border border-amber-500/30'
                    : isHigh
                    ? 'bg-emerald-500/15 text-emerald-300 hover:bg-emerald-500/25 border border-emerald-500/30'
                    : 'bg-slate-800/90 text-slate-300 hover:bg-slate-700 border border-slate-700/70'
                }`}
              >
                {item.crashPoint.toFixed(2)}x
              </button>
            );
          })}
        </div>

        {/* Audio Control: Single Simple Mute/Unmute Button */}
        <div className="flex items-center gap-2 shrink-0">
          <button
            type="button"
            onClick={toggleMute}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
              audioSettings.muted
                ? 'bg-rose-950/70 border border-rose-700/70 text-rose-300'
                : 'bg-slate-800/90 hover:bg-slate-700 text-slate-200 border border-slate-700/60'
            }`}
            title={audioSettings.muted ? 'Unmute game audio' : 'Mute game audio'}
          >
            {audioSettings.muted ? (
              <VolumeX className="w-4 h-4 text-rose-400" />
            ) : (
              <Volume2 className="w-4 h-4 text-emerald-400" />
            )}
            <span>{audioSettings.muted ? 'Muted' : 'Sound'}</span>
          </button>
        </div>
      </div>

      {/* Main Aviation Crash Stage */}
      <div className="relative w-full h-[210px] sm:h-[300px] lg:h-[390px] rounded-2xl overflow-hidden border border-slate-800 bg-[#0A0D14]">
        <canvas ref={canvasRef} className="w-full h-full block" />

        {/* Top-Left Flight Telemetry Metadata (Unboxed clean text with separators) */}
        <div className="absolute top-3.5 left-4 right-4 flex flex-wrap items-center justify-between gap-2 pointer-events-none text-xs text-slate-400">
          <div className="flex items-center gap-2 font-mono-tabular">
            <span className="text-slate-300 font-semibold">{gameState.roundId}</span>
            <span aria-hidden="true" className="hidden sm:inline">·</span>
            <span className="hidden sm:inline text-slate-500 truncate max-w-[220px]">
              SHA256: {gameState.serverSeedHash.slice(0, 16)}...
            </span>
          </div>
          <div className="font-mono-tabular text-slate-400">
            {gameState.activeBets.length} {gameState.activeBets.length === 1 ? 'Active Bet' : 'Active Bets'}
          </div>
        </div>

        {/* Center Multiplier & State Readout */}
        <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none px-4 text-center">
          {gameState.phase === 'BETTING' && (
            <div className="flex flex-col items-center max-w-xs w-full">
              <p className="text-xs font-semibold tracking-wider text-rose-400 mb-1">
                PREPARING NEXT TAKEOFF
              </p>
              <div className="text-3xl sm:text-4xl font-display font-bold text-white font-mono-tabular mb-3">
                {countdownSec}s
              </div>
              <div className="w-48 h-2 bg-slate-800 rounded-full overflow-hidden border border-slate-700">
                <div
                  className="h-full bg-rose-600 transition-all duration-100"
                  style={{ width: `${progressPercent}%` }}
                />
              </div>
              <p className="text-xs text-slate-400 mt-2.5">
                Place your bet before takeoff
              </p>
            </div>
          )}

          {gameState.phase === 'FLYING' && (
            <div className="flex flex-col items-center">
              <div className="text-5xl sm:text-7xl font-display font-extrabold tracking-tight text-white font-mono-tabular drop-shadow-[0_4px_24px_rgba(225,29,72,0.45)]">
                {gameState.multiplier.toFixed(2)}x
              </div>
              {gameState.myBet && !gameState.myBet.cashedOut && (
                <p className="mt-2 text-sm font-mono-tabular font-semibold text-emerald-400">
                  Cash Out Value: ₹{(gameState.myBet.amount * gameState.multiplier).toFixed(2)}
                </p>
              )}
              {gameState.myBet && gameState.myBet.cashedOut && (
                <p className="mt-2 text-sm font-mono-tabular font-semibold text-emerald-400">
                  Cashed Out at {gameState.myBet.cashoutMultiplier?.toFixed(2)}x (+₹{gameState.myBet.payout?.toFixed(2)})
                </p>
              )}
            </div>
          )}

          {gameState.phase === 'CRASHED' && (
            <div className="flex flex-col items-center">
              <p className="text-sm sm:text-base font-display font-bold tracking-wider text-rose-500 mb-1">
                FLEW AWAY!
              </p>
              <div className="text-5xl sm:text-7xl font-display font-extrabold tracking-tight text-rose-500 font-mono-tabular">
                {gameState.multiplier.toFixed(2)}x
              </div>
              <p className="text-xs text-slate-400 mt-2">
                Round settled · Next flight starting shortly
              </p>
            </div>
          )}
        </div>
      </div>

      {/* Provably Fair Verification Modal */}
      {selectedHistoryRound && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 p-4">
          <div className="bg-[#121723] border border-slate-800 rounded-2xl max-w-lg w-full p-6 shadow-2xl">
            <div className="flex items-center justify-between pb-4 border-b border-slate-800">
              <div className="flex items-center gap-2">
                <ShieldCheck className="w-5 h-5 text-emerald-400" />
                <h3 className="text-lg font-display font-bold text-white">
                  Server-Validated Round Verification
                </h3>
              </div>
              <button
                type="button"
                onClick={() => setSelectedHistoryRound(null)}
                className="p-1.5 text-slate-400 hover:text-white rounded-lg hover:bg-slate-800 transition-colors cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="py-4 space-y-3 text-sm">
              <div className="flex items-center justify-between text-xs text-slate-400">
                <span>Flight ID: {selectedHistoryRound.roundId}</span>
                <span>·</span>
                <span>Crash Multiplier: {selectedHistoryRound.crashPoint.toFixed(2)}x</span>
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-400 mb-1">
                  Pre-Flight SHA-256 Commitment Hash
                </label>
                <div className="p-2.5 rounded-lg bg-[#0A0D14] border border-slate-800 font-mono-tabular text-xs text-slate-300 break-all">
                  {selectedHistoryRound.serverSeedHash}
                </div>
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-400 mb-1">
                  Revealed Server Seed (Post-Crash)
                </label>
                <div className="p-2.5 rounded-lg bg-[#0A0D14] border border-slate-800 font-mono-tabular text-xs text-emerald-300 break-all">
                  {selectedHistoryRound.serverSeed}
                </div>
              </div>

              <p className="text-xs text-slate-400 leading-relaxed pt-1">
                Every flight crash point is predetermined on the server before betting opens using a 256-bit cryptographic seed. Neither the browser nor any player can alter the multiplier outcome.
              </p>
            </div>

            <div className="pt-3 border-t border-slate-800 flex justify-end">
              <button
                type="button"
                onClick={() => setSelectedHistoryRound(null)}
                className="px-4 py-2 rounded-lg text-xs font-semibold bg-slate-800 text-white hover:bg-slate-700 transition-colors cursor-pointer"
              >
                Close Verification
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
