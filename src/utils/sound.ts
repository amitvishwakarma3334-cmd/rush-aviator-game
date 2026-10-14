// Aviator Flight Audio Controller & Synthesized Sound Effects
// High-fidelity sound manager with balanced Web Audio API gain graph,
// compressor stage, volume controls, and strict game-round lifecycle sync.

export interface AudioSettings {
  masterVolume: number; // 0.0 to 1.0 (Master multiplier)
  bgVolume: number;     // 0.0 to 1.0 (Flight engine & ambient music, default 0.85)
  sfxVolume: number;    // 0.0 to 1.0 (Game sound effects, default 0.90)
  muted: boolean;
}

class SoundController {
  private ctx: AudioContext | null = null;
  private sfxMasterGain: GainNode | null = null;
  private compressor: DynamicsCompressorNode | null = null;
  private flightAudio: HTMLAudioElement | null = null;

  // Audio Settings with requested defaults
  public masterVolume: number = 1.0;
  public bgVolume: number = 0.85;   // Requirement 2: 85% default for background/ambient
  public sfxVolume: number = 0.90;  // Requirement 3: 90% default for sound effects
  public muted: boolean = false;

  private currentRoundId: string | null = null;
  private currentPhase: 'BETTING' | 'FLYING' | 'CRASHED' = 'BETTING';
  private isPlayingFlight: boolean = false;
  private audioSourceUrl: string = '/assets/flight-audio.mp3';
  private listenersAttached: boolean = false;
  private pendingAutoplay: boolean = false;

  private subscribers: Set<(settings: AudioSettings) => void> = new Set();
  public onMuteChange?: (muted: boolean) => void;

  constructor() {
    this.loadPersistedSettings();
    if (typeof window !== 'undefined') {
      this.attachInteractionListeners();
    }
  }

  private loadPersistedSettings(): void {
    if (typeof window === 'undefined') return;
    try {
      const savedMaster = localStorage.getItem('aviator_audio_master');
      if (savedMaster !== null) {
        const val = parseFloat(savedMaster);
        if (!isNaN(val) && val >= 0 && val <= 1) this.masterVolume = val;
      }

      const savedBg = localStorage.getItem('aviator_audio_bg');
      if (savedBg !== null) {
        const val = parseFloat(savedBg);
        if (!isNaN(val) && val >= 0 && val <= 1) this.bgVolume = val;
      }

      const savedSfx = localStorage.getItem('aviator_audio_sfx');
      if (savedSfx !== null) {
        const val = parseFloat(savedSfx);
        if (!isNaN(val) && val >= 0 && val <= 1) this.sfxVolume = val;
      }

      const savedMuted = localStorage.getItem('aviator_audio_muted');
      if (savedMuted !== null) {
        this.muted = savedMuted === 'true';
      }
    } catch {
      // localStorage may fail in private mode; fallback to defaults
    }
  }

  private persistSettings(): void {
    if (typeof window === 'undefined') return;
    try {
      localStorage.setItem('aviator_audio_master', this.masterVolume.toFixed(2));
      localStorage.setItem('aviator_audio_bg', this.bgVolume.toFixed(2));
      localStorage.setItem('aviator_audio_sfx', this.sfxVolume.toFixed(2));
      localStorage.setItem('aviator_audio_muted', this.muted ? 'true' : 'false');
    } catch {
      // ignore
    }
  }

  public getSettings(): AudioSettings {
    return {
      masterVolume: this.masterVolume,
      bgVolume: this.bgVolume,
      sfxVolume: this.sfxVolume,
      muted: this.muted,
    };
  }

  public subscribe(fn: (settings: AudioSettings) => void): () => void {
    this.subscribers.add(fn);
    fn(this.getSettings());
    return () => {
      this.subscribers.delete(fn);
    };
  }

  private notifySubscribers(): void {
    const settings = this.getSettings();
    this.subscribers.forEach((fn) => {
      try {
        fn(settings);
      } catch (err) {
        console.error('Audio subscriber error:', err);
      }
    });
    this.onMuteChange?.(this.muted);
  }

  private initAudioGraph(ctx: AudioContext): void {
    if (this.compressor && this.sfxMasterGain) return;

    // Master Dynamics Compressor prevents clipping distortion when multiple sound effects play simultaneously
    this.compressor = ctx.createDynamicsCompressor();
    this.compressor.threshold.setValueAtTime(-6, ctx.currentTime);
    this.compressor.knee.setValueAtTime(12, ctx.currentTime);
    this.compressor.ratio.setValueAtTime(4, ctx.currentTime);
    this.compressor.attack.setValueAtTime(0.003, ctx.currentTime);
    this.compressor.release.setValueAtTime(0.15, ctx.currentTime);
    this.compressor.connect(ctx.destination);

    // SFX Master Gain node applying sfxVolume and masterVolume
    this.sfxMasterGain = ctx.createGain();
    this.updateSfxGain();
    this.sfxMasterGain.connect(this.compressor);
  }

  private updateSfxGain(): void {
    if (!this.sfxMasterGain || !this.ctx) return;
    const effectiveGain = this.muted
      ? 0
      : Math.max(0, Math.min(1, this.sfxVolume * this.masterVolume));
    try {
      this.sfxMasterGain.gain.setValueAtTime(effectiveGain, this.ctx.currentTime);
    } catch {
      this.sfxMasterGain.gain.value = effectiveGain;
    }
  }

  private getContext(): AudioContext | null {
    if (typeof window === 'undefined') return null;
    if (!this.ctx) {
      const AudioCtx =
        window.AudioContext ||
        (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      if (AudioCtx) {
        this.ctx = new AudioCtx();
        this.initAudioGraph(this.ctx);
      }
    }
    if (this.ctx && this.ctx.state === 'suspended') {
      this.ctx.resume().catch(() => {});
    }
    if (this.ctx && (!this.sfxMasterGain || !this.compressor)) {
      this.initAudioGraph(this.ctx);
    }
    return this.ctx;
  }

  private updateFlightAudioVolume(): void {
    if (!this.flightAudio) return;
    const effectiveBgVolume = this.muted
      ? 0
      : Math.max(0, Math.min(1, this.bgVolume * this.masterVolume));
    this.flightAudio.volume = effectiveBgVolume;
    this.flightAudio.muted = this.muted;
  }

  private ensureFlightAudio(): HTMLAudioElement | null {
    if (typeof window === 'undefined') return null;
    if (!this.flightAudio) {
      this.flightAudio = new Audio(this.audioSourceUrl);
      this.flightAudio.preload = 'auto';
      // If flight lasts longer than audio, do not restart or loop automatically
      this.flightAudio.loop = false;
      this.updateFlightAudioVolume();

      this.flightAudio.addEventListener('ended', () => {
        this.isPlayingFlight = false;
      });

      this.flightAudio.addEventListener('error', (e) => {
        if (this.audioSourceUrl === '/assets/flight-audio.mp3') {
          // Stable fallback to root public path if needed
          this.audioSourceUrl = '/flight-audio.mp3';
          if (this.flightAudio) {
            this.flightAudio.src = this.audioSourceUrl;
            this.flightAudio.load();
          }
          return;
        }
        console.warn('Flight audio error:', e);
        this.isPlayingFlight = false;
      });
    }
    this.updateFlightAudioVolume();
    return this.flightAudio;
  }

  // Gracefully unlock audio after first user gesture (touch, click, keydown)
  public attachInteractionListeners(): void {
    if (this.listenersAttached || typeof window === 'undefined') return;
    this.listenersAttached = true;

    const unlockHandler = () => {
      this.unlockOnUserInteraction();
      window.removeEventListener('pointerdown', unlockHandler);
      window.removeEventListener('click', unlockHandler);
      window.removeEventListener('keydown', unlockHandler);
      window.removeEventListener('touchstart', unlockHandler);
    };

    window.addEventListener('pointerdown', unlockHandler, { passive: true });
    window.addEventListener('click', unlockHandler, { passive: true });
    window.addEventListener('keydown', unlockHandler, { passive: true });
    window.addEventListener('touchstart', unlockHandler, { passive: true });
  }

  public unlockOnUserInteraction(): void {
    const ctx = this.getContext();
    if (ctx && ctx.state === 'suspended') {
      ctx.resume().catch(() => {});
    }
    const audio = this.ensureFlightAudio();
    if (audio) {
      if (this.pendingAutoplay && this.currentPhase === 'FLYING' && !this.muted) {
        this.pendingAutoplay = false;
        this.startFlightAudio();
      }
    }
  }

  public getAudioAssetPath(): string {
    return this.audioSourceUrl;
  }

  // Synchronizes audio playback strictly with authoritative game round state
  public syncWithGameState(phase: 'BETTING' | 'FLYING' | 'CRASHED', roundId: string): void {
    const prevPhase = this.currentPhase;
    const roundChanged = this.currentRoundId !== roundId;
    this.currentPhase = phase;
    this.currentRoundId = roundId;

    if (phase === 'FLYING') {
      // 1. When plane takes off and starts flying, immediately start playing from the beginning
      // 5. Start audio again from the beginning when the next round's plane takes off
      if (prevPhase !== 'FLYING' || roundChanged || !this.isPlayingFlight) {
        this.startFlightAudio();
      }
    } else {
      // 3. Audio must stop immediately when plane crashes or round ends
      // 4. Do not play audio during countdown, before takeoff, between rounds, or on ground
      if (this.isPlayingFlight || prevPhase === 'FLYING') {
        this.stopFlightAudio();
      }
      if (prevPhase === 'FLYING' && phase === 'CRASHED') {
        this.playCrash();
      }
    }
  }

  // Requirement 1: Start playing flight audio from beginning
  public startFlightAudio(): void {
    if (this.muted) return;
    const audio = this.ensureFlightAudio();
    if (!audio) return;

    try {
      this.updateFlightAudioVolume();
      audio.currentTime = 0;
      const playPromise = audio.play();
      this.isPlayingFlight = true;

      if (playPromise !== undefined) {
        playPromise.catch((err) => {
          // Autoplay restricted until interaction
          this.pendingAutoplay = true;
          this.isPlayingFlight = false;
          console.warn('Flight audio autoplay was deferred until user interaction:', err?.message || err);
        });
      }
    } catch (err) {
      this.isPlayingFlight = false;
      console.warn('Flight audio play error:', err);
    }
  }

  // Requirement 3: Stop immediately on crash or round end
  public stopFlightAudio(): void {
    this.isPlayingFlight = false;
    this.pendingAutoplay = false;
    if (this.flightAudio) {
      try {
        this.flightAudio.pause();
        this.flightAudio.currentTime = 0;
      } catch {
        // ignore
      }
    }
  }

  // Volume & Mute Controls (Requirements 1, 2, 3, 6, 7)
  public setMasterVolume(volume: number): void {
    this.masterVolume = Math.max(0, Math.min(1, volume));
    this.updateFlightAudioVolume();
    this.updateSfxGain();
    this.persistSettings();
    this.notifySubscribers();
  }

  public setBgVolume(volume: number): void {
    this.bgVolume = Math.max(0, Math.min(1, volume));
    this.updateFlightAudioVolume();
    this.persistSettings();
    this.notifySubscribers();
  }

  public setSfxVolume(volume: number): void {
    this.sfxVolume = Math.max(0, Math.min(1, volume));
    this.updateSfxGain();
    this.persistSettings();
    this.notifySubscribers();
  }

  public setMuted(muted: boolean): void {
    this.muted = muted;
    this.updateFlightAudioVolume();
    this.updateSfxGain();
    if (muted) {
      this.stopFlightAudio();
    } else if (this.currentPhase === 'FLYING') {
      this.startFlightAudio();
    }
    this.persistSettings();
    this.notifySubscribers();
  }

  public toggleMute(): boolean {
    this.setMuted(!this.muted);
    return this.muted;
  }

  public resetDefaults(): void {
    this.masterVolume = 1.0;
    this.bgVolume = 0.85; // 85% default
    this.sfxVolume = 0.90; // 90% default
    this.muted = false;
    this.updateFlightAudioVolume();
    this.updateSfxGain();
    this.persistSettings();
    this.notifySubscribers();
  }

  // Sound effects with clearly audible output balanced through master SFX gain and compressor

  // Bet Placed: Crisp audible confirmation chirp (prominent 85% base gain)
  public playBetPlaced(): void {
    if (this.muted) return;
    const ctx = this.getContext();
    if (!ctx || !this.sfxMasterGain) return;

    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(540, ctx.currentTime);
    osc.frequency.exponentialRampToValueAtTime(740, ctx.currentTime + 0.08);

    // Clearly audible level, cleanly ramped
    gain.gain.setValueAtTime(0.85, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.10);

    osc.connect(gain);
    gain.connect(this.sfxMasterGain);
    osc.start();
    osc.stop(ctx.currentTime + 0.10);
  }

  // Cashout Success: Uplifting, celebratory harmonic arpeggio (clearly audible chimes)
  public playCashoutSuccess(): void {
    if (this.muted) return;
    const ctx = this.getContext();
    if (!ctx || !this.sfxMasterGain) return;

    const now = ctx.currentTime;
    // D5, F#5, A5, D6 celebratory major chord progression
    const freqs = [587.33, 739.99, 880.0, 1174.66];
    freqs.forEach((f, idx) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'triangle';
      const noteStart = now + idx * 0.045;
      const noteDuration = 0.32;

      osc.frequency.setValueAtTime(f, noteStart);
      gain.gain.setValueAtTime(0.55, noteStart);
      gain.gain.exponentialRampToValueAtTime(0.001, noteStart + noteDuration);

      osc.connect(gain);
      gain.connect(this.sfxMasterGain!);
      osc.start(noteStart);
      osc.stop(noteStart + noteDuration + 0.02);
    });
  }

  // Crash: Deep impact thud and frequency plunge
  public playCrash(): void {
    if (this.muted) return;
    const ctx = this.getContext();
    if (!ctx || !this.sfxMasterGain) return;

    const now = ctx.currentTime;

    // Sub rumble sweep
    const osc = ctx.createOscillator();
    const oscGain = ctx.createGain();
    osc.type = 'sawtooth';
    osc.frequency.setValueAtTime(260, now);
    osc.frequency.exponentialRampToValueAtTime(45, now + 0.32);

    oscGain.gain.setValueAtTime(0.90, now);
    oscGain.gain.exponentialRampToValueAtTime(0.001, now + 0.35);

    osc.connect(oscGain);
    oscGain.connect(this.sfxMasterGain);
    osc.start(now);
    osc.stop(now + 0.36);

    // Crash noise burst for physical impact
    try {
      const bufferSize = ctx.sampleRate * 0.25;
      const noiseBuffer = ctx.createBuffer(1, bufferSize, ctx.sampleRate);
      const output = noiseBuffer.getChannelData(0);
      for (let i = 0; i < bufferSize; i++) {
        output[i] = Math.random() * 2 - 1;
      }
      const whiteNoise = ctx.createBufferSource();
      whiteNoise.buffer = noiseBuffer;

      // Lowpass filter to shape into an explosion
      const filter = ctx.createBiquadFilter();
      filter.type = 'lowpass';
      filter.frequency.setValueAtTime(800, now);
      filter.frequency.exponentialRampToValueAtTime(80, now + 0.25);

      const noiseGain = ctx.createGain();
      noiseGain.gain.setValueAtTime(0.70, now);
      noiseGain.gain.exponentialRampToValueAtTime(0.001, now + 0.25);

      whiteNoise.connect(filter);
      filter.connect(noiseGain);
      noiseGain.connect(this.sfxMasterGain);
      whiteNoise.start(now);
      whiteNoise.stop(now + 0.26);
    } catch {
      // AudioBuffer creation fallback handled smoothly
    }
  }

  // Deposit Success: Celebratory coin cascade & rich harmonic sparkle
  public playDepositSuccess(): void {
    if (this.muted) return;
    const ctx = this.getContext();
    if (!ctx || !this.sfxMasterGain) return;

    const now = ctx.currentTime;
    // C5, E5, G5, C6 uplifting bright arpeggio with warm shimmer
    const notes = [523.25, 659.25, 783.99, 1046.5];
    notes.forEach((freq, idx) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'triangle';
      const start = now + idx * 0.055;
      const duration = 0.36;

      osc.frequency.setValueAtTime(freq, start);
      gain.gain.setValueAtTime(0.65, start);
      gain.gain.exponentialRampToValueAtTime(0.001, start + duration);

      osc.connect(gain);
      gain.connect(this.sfxMasterGain!);
      osc.start(start);
      osc.stop(start + duration + 0.02);
    });
  }

  // Withdrawal Request: Reassuring, clear banking submission confirmation chime
  public playWithdrawalRequest(): void {
    if (this.muted) return;
    const ctx = this.getContext();
    if (!ctx || !this.sfxMasterGain) return;

    const now = ctx.currentTime;
    // Two-tone confident chime: F5 (698.46) -> C6 (1046.50)
    const tones = [698.46, 1046.5];
    tones.forEach((freq, idx) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'sine';
      const start = now + idx * 0.09;
      const duration = 0.30;

      osc.frequency.setValueAtTime(freq, start);
      gain.gain.setValueAtTime(0.70, start);
      gain.gain.exponentialRampToValueAtTime(0.001, start + duration);

      osc.connect(gain);
      gain.connect(this.sfxMasterGain!);
      osc.start(start);
      osc.stop(start + duration + 0.02);
    });
  }

  // Withdrawal Status Update: Subtle pleasant chime
  public playWithdrawalStatusUpdate(): void {
    if (this.muted) return;
    const ctx = this.getContext();
    if (!ctx || !this.sfxMasterGain) return;

    const now = ctx.currentTime;
    // Ascending chime: A5 (880.00) -> D6 (1174.66)
    const tones = [880.0, 1174.66];
    tones.forEach((freq, idx) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'sine';
      const start = now + idx * 0.07;
      const duration = 0.25;

      osc.frequency.setValueAtTime(freq, start);
      gain.gain.setValueAtTime(0.60, start);
      gain.gain.exponentialRampToValueAtTime(0.001, start + duration);

      osc.connect(gain);
      gain.connect(this.sfxMasterGain!);
      osc.start(start);
      osc.stop(start + duration + 0.02);
    });
  }

  // Interactive Test Sound to let user preview current SFX volume level
  public playTestChime(): void {
    if (this.muted) return;
    const ctx = this.getContext();
    if (!ctx || !this.sfxMasterGain) return;

    const now = ctx.currentTime;
    const freqs = [784.0, 1046.5]; // G5, C6
    freqs.forEach((f, idx) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'sine';
      const noteStart = now + idx * 0.08;
      osc.frequency.setValueAtTime(f, noteStart);
      gain.gain.setValueAtTime(0.75, noteStart);
      gain.gain.exponentialRampToValueAtTime(0.001, noteStart + 0.22);

      osc.connect(gain);
      gain.connect(this.sfxMasterGain!);
      osc.start(noteStart);
      osc.stop(noteStart + 0.24);
    });
  }
}

export const soundFx = new SoundController();
