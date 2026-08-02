'use client';

import { useEffect, useState } from 'react';
import { toast } from 'sonner';
import { Share2, Download, Link2, Check } from 'lucide-react';
import { NeonButton } from '@/components/ui/neon';

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
   * Both of these depend on browser APIs, so they must NOT be read during render.
   *
   * Doing so caused a real hydration mismatch (React #418): the server has no
   * `navigator`, so the Share button was absent from the SSR HTML, but Chromium
   * exposes `navigator.share`, so the client's first render included it. React
   * then found a tree it did not expect and discarded the server markup.
   *
   * Deferring to an effect means the first client render matches the server
   * exactly, and the button appears once hydration is complete.
   */
  const [canNativeShare, setCanNativeShare] = useState(false);
  const [url, setUrl] = useState(`/case/${caseId}`);

  useEffect(() => {
    setUrl(`${window.location.origin}/case/${caseId}`);
    setCanNativeShare(typeof navigator.share === 'function');
  }, [caseId]);

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
