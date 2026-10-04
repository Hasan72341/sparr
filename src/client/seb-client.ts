export interface SebProof {
  pageUrl: string;
  configHash: string;
}
declare global {
  interface Window {
    SafeExamBrowser?: {
      security?: {
        configKey?: string;
        updateKeys?: (callback: () => void) => void;
      };
      version?: string;
    };
  }
}
let pending: Promise<SebProof> | undefined;
export function sebProof(): Promise<SebProof> {
  if (pending) return pending;
  pending = new Promise<SebProof>((resolve, reject) => {
    const security = window.SafeExamBrowser?.security;
    if (!security) {
      reject(
        new Error(
          "Open this strict interview using its generated SEB configuration.",
        ),
      );
      return;
    }
    // SEB 3.1+ publishes the page-bound key directly. The supported macOS
    // client is >=3.7; do not depend on a legacy callback evaluated by SEB.
    // https://safeexambrowser.org/developer/seb-config-key.html
    const deadline = Date.now() + 2000;
    const read = () => {
      const configHash = window.SafeExamBrowser?.security?.configKey;
      if (configHash && /^[a-f0-9]{64}$/.test(configHash)) {
        resolve({ pageUrl: window.location.href.split("#")[0], configHash });
      } else if (Date.now() >= deadline) {
        reject(
          new Error(
            "SEB did not provide its configuration key. Quit SEB and open a fresh strict configuration.",
          ),
        );
      } else {
        window.setTimeout(read, 50);
      }
    };
    read();
  }).finally(() => {
    pending = undefined;
  });
  return pending;
}
