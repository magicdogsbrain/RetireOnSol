import { useState, useEffect, useCallback, useRef } from 'react';
import { Capacitor } from '@capacitor/core';
import { App } from '@capacitor/app';

let NativeBiometric: any = null;

const HAS_DATA_KEY = 'retireonsol_has_data';

function hasUserData(): boolean {
  try {
    return localStorage.getItem(HAS_DATA_KEY) === '1';
  } catch { return false; }
}

/** Call this when the user first interacts (saves settings, executes plan, etc.) */
export function markAppUsed(): void {
  try { localStorage.setItem(HAS_DATA_KEY, '1'); } catch { /* ignore */ }
}

/** Call this on full reset to disable biometric until next use */
export function clearAppUsed(): void {
  try { localStorage.removeItem(HAS_DATA_KEY); } catch { /* ignore */ }
}

export function useBiometricLock() {
  // Only start locked if native + user has prior data worth protecting
  const [isLocked, setIsLocked] = useState(
    Capacitor.isNativePlatform() && hasUserData()
  );
  const [isAvailable, setIsAvailable] = useState(false);
  const authenticating = useRef(false);

  const doVerify = useCallback(async () => {
    if (!NativeBiometric || authenticating.current) return false;
    authenticating.current = true;
    try {
      await NativeBiometric.verifyIdentity({
        reason: 'Unlock RetireOnSol',
        title: 'Unlock RetireOnSol',
        subtitle: 'Verify your identity to continue',
      });
      console.log('[Biometric] Unlock success');
      setIsLocked(false);
      authenticating.current = false;
      return true;
    } catch (e) {
      console.log('[Biometric] Unlock failed/cancelled:', e);
      authenticating.current = false;
      return false;
    }
  }, []);

  const authenticate = useCallback(async () => {
    return doVerify();
  }, [doVerify]);

  useEffect(() => {
    if (!Capacitor.isNativePlatform()) return;

    let resumeListener: any = null;
    let wasBackground = false;

    const init = async () => {
      try {
        const mod = await import('@capgo/capacitor-native-biometric');
        NativeBiometric = mod.NativeBiometric;

        const result = await NativeBiometric.isAvailable();
        console.log('[Biometric] Available:', result, 'hasData:', hasUserData());
        if (result.isAvailable) {
          setIsAvailable(true);

          // Cold start — only prompt if user has saved data
          if (hasUserData()) {
            setTimeout(() => {
              doVerify();
            }, 300);
          } else {
            setIsLocked(false);
          }

          // Listen for app resume (coming back from task manager)
          resumeListener = await App.addListener('appStateChange', ({ isActive }) => {
            console.log('[Biometric] appStateChange isActive:', isActive);
            if (!isActive) {
              wasBackground = true;
            } else if (wasBackground) {
              wasBackground = false;
              // Only lock on resume if there's data to protect
              if (hasUserData()) {
                setIsLocked(true);
                setTimeout(() => {
                  doVerify();
                }, 300);
              }
            }
          });
        } else {
          console.log('[Biometric] Not available, unlocking');
          setIsLocked(false);
        }
      } catch (e) {
        console.log('[Biometric] Error, unlocking:', e);
        setIsLocked(false);
      }
    };

    init();

    return () => {
      if (resumeListener) {
        resumeListener.remove();
      }
    };
  }, [doVerify]);

  return { isLocked, isAvailable, authenticate };
}
