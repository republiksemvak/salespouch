import { useEffect, useState } from "react";
import { Download, Share, X } from "lucide-react";

type BeforeInstallPromptEvent = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
};

function isStandalone() {
  return window.matchMedia("(display-mode: standalone)").matches ||
    ("standalone" in navigator && Boolean((navigator as Navigator & { standalone?: boolean }).standalone));
}

function isIOS() {
  return /iPad|iPhone|iPod/.test(navigator.userAgent) ||
    (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
}

export function PwaInstallPrompt() {
  const [installEvent, setInstallEvent] = useState<BeforeInstallPromptEvent | null>(null);
  const [visible, setVisible] = useState(false);
  const [ios, setIos] = useState(false);

  useEffect(() => {
    if ("serviceWorker" in navigator) {
      navigator.serviceWorker.register("/sw.js").catch(() => undefined);
    }

    if (isStandalone()) return;

    const handleBeforeInstall = (event: Event) => {
      event.preventDefault();
      setInstallEvent(event as BeforeInstallPromptEvent);
      setVisible(true);
    };

    window.addEventListener("beforeinstallprompt", handleBeforeInstall);

    if (isIOS()) {
      setIos(true);
      const timer = window.setTimeout(() => setVisible(true), 1200);
      return () => {
        window.clearTimeout(timer);
        window.removeEventListener("beforeinstallprompt", handleBeforeInstall);
      };
    }

    return () => window.removeEventListener("beforeinstallprompt", handleBeforeInstall);
  }, []);

  const dismiss = () => {
    setVisible(false);
  };

  const install = async () => {
    if (!installEvent) return;
    await installEvent.prompt();
    const choice = await installEvent.userChoice;
    setInstallEvent(null);
    setVisible(false);
  };

  if (!visible) return null;

  return (
    <div className="fixed inset-x-3 bottom-3 z-[100] mx-auto max-w-md rounded-2xl border bg-background p-4 shadow-2xl ring-1 ring-black/5">
      <button
        type="button"
        onClick={dismiss}
        aria-label="Tutup"
        className="absolute right-3 top-3 rounded-full p-1 text-muted-foreground hover:bg-muted"
      >
        <X className="h-4 w-4" />
      </button>

      <div className="pr-7">
        <div className="flex items-center gap-2 font-semibold text-foreground">
          <Download className="h-5 w-5 text-primary" />
          Aman Diinstal
        </div>
        <p className="mt-1 text-sm leading-relaxed text-muted-foreground">
          Berbasis web native, praktis untuk mempermudah pekerjaan sales.
        </p>
      </div>

      {ios ? (
        <div className="mt-3 rounded-xl bg-muted/60 p-3 text-xs leading-relaxed text-foreground">
          Ketuk <Share className="mx-1 inline h-3.5 w-3.5 align-text-bottom" /> lalu pilih <strong>Tambahkan ke Layar Utama</strong>.
        </div>
      ) : (
        <button
          type="button"
          onClick={install}
          className="mt-3 w-full rounded-xl bg-primary px-4 py-2.5 text-sm font-semibold text-primary-foreground transition-opacity hover:opacity-90"
        >
          Install Sales Pouch
        </button>
      )}

      <button
        type="button"
        onClick={dismiss}
        className="mt-2 w-full py-1 text-xs font-medium text-muted-foreground hover:text-foreground"
      >
        Nanti
      </button>
    </div>
  );
}
