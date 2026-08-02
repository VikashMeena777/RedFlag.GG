'use client';

import { useState, useSyncExternalStore } from 'react';
import { toast } from 'sonner';
import { Share2, Download, Link2, Check } from 'lucide-react';
import { NeonButton } from '@/components/ui/neon';

/**
 * Whether this browser can open a native share sheet.
 *
 * `useSyncExternalStore` rather than an effect, because this is exactly what it
 * is for: reading a value that differs between server and client without causing
 * a hydration mismatch. The server snapshot returns `false`, so SSR and the first
 * client render agree; React then re-reads the client snapshot and reveals the
 * button. An effect achieved the same result but triggered a cascading render,
 * which the React lint rule flags.
 *
 * `subscribe` is a no-op: `navigator.share` never changes for the life of a page.
 */
const noopSubscribe = () => () => {};

function useCanNativeShare(): boolean {
  return useSyncExternalStore(
    noopSubscribe,
    () => typeof navigator !== 'undefined' && typeof navigator.share === 'function',
    () => false
  );
}

/** Absolute URL for sharing, resolved the same hydration-safe way. */
function useShareUrl(caseId: string): string {
  return useSyncExternalStore(
    noopSubscribe,
    () => `${window.location.origin}/case/${caseId}`,
    // Server snapshot: a relative path. Never surfaced to the user, because the
    // buttons that use it only act after hydration.
    () => `/case/${caseId}`
  );
}

/**
 * Share controls.
 *
 * Sits outside the card frame so it never appears in a screenshot of the verdict.
 * Three escalating options: the native share sheet where available (mobile, the
 * main case), a PNG download for stories, and copy-link as the universal fallback.
 */
export function ShareRow({
  caseId,
  headline,
}: {
  /** `public_id`, e.g. "CASE-7421". */
  caseId: string;
  headline: string;
}) {
  const [copied, setCopied] = useState(false);
  const [downloading, setDownloading] = useState(false);

  /*
   * Both depend on browser APIs, so neither may be read during render.
   *
   * Reading them directly caused a real hydration mismatch (React #418): the
   * server has no `navigator`, so the Share button was absent from the SSR HTML,
   * but Chromium exposes `navigator.share`, so the client's first render included
   * it. React found a tree it did not expect and discarded the server markup.
   */
  const canNativeShare = useCanNativeShare();
  const url = useShareUrl(caseId);

  async function nativeShare() {
    try {
      await navigator.share({ title: 'RedFlag.gg verdict', text: headline, url });
    } catch (error) {
      // AbortError is the user dismissing the sheet — not a failure.
      if ((error as Error)?.name !== 'AbortError') {
        toast.error('Could not open the share sheet.');
      }
    }
  }

  async function copyLink() {
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      toast.success('Link copied');
      setTimeout(() => setCopied(false), 2000);
    } catch {
      toast.error('Could not copy. Long-press the address bar instead.');
    }
  }

  async function downloadCard() {
    setDownloading(true);
    try {
      const response = await fetch(`/api/card/${caseId}`);
      if (!response.ok) {
        toast.error(
          response.status === 429
            ? 'Too many downloads. Try again shortly.'
            : 'Card not ready yet.'
        );
        return;
      }
      const blob = await response.blob();
      const objectUrl = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = objectUrl;
      link.download = `redflag-${caseId.toLowerCase()}.png`;
      document.body.appendChild(link);
      link.click();
      link.remove();
      URL.revokeObjectURL(objectUrl);
      toast.success('Card saved');
    } catch {
      toast.error('Download failed.');
    } finally {
      setDownloading(false);
    }
  }

  return (
    <div className="no-print flex flex-wrap gap-2.5">
      {canNativeShare && (
        <NeonButton variant="red" onClick={nativeShare}>
          <Share2 className="size-4" strokeWidth={2} aria-hidden />
          Share
        </NeonButton>
      )}

      <NeonButton
        variant="ink"
        onClick={downloadCard}
        disabled={downloading}
        aria-busy={downloading}
      >
        <Download className="size-4" strokeWidth={2} aria-hidden />
        {downloading ? 'Saving…' : 'Save card'}
      </NeonButton>

      <NeonButton variant="outline" onClick={copyLink}>
        {copied ? (
          <Check className="size-4" strokeWidth={2} aria-hidden />
        ) : (
          <Link2 className="size-4" strokeWidth={2} aria-hidden />
        )}
        {copied ? 'Copied' : 'Copy link'}
      </NeonButton>
    </div>
  );
}
