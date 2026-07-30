'use client';

import { useState } from 'react';
import { toast } from 'sonner';
import { Share2, Download, Link2, Check } from 'lucide-react';
import { BrutButton } from '@/components/ui/brut';

/**
 * Share controls.
 *
 * Sits outside the card frame so it never appears in a screenshot of the verdict.
 * Three escalating options: native share sheet where available (mobile, the main
 * case), a PNG download for stories, and copy-link as the universal fallback.
 */
export function ShareRow({
  slug,
  headline,
}: {
  slug: string;
  headline: string;
}) {
  const [copied, setCopied] = useState(false);
  const [downloading, setDownloading] = useState(false);

  const url =
    typeof window !== 'undefined'
      ? `${window.location.origin}/case/${slug}`
      : `/case/${slug}`;

  const canNativeShare =
    typeof navigator !== 'undefined' && typeof navigator.share === 'function';

  async function nativeShare() {
    try {
      await navigator.share({
        title: 'RedFlag.GG verdict',
        text: headline,
        url,
      });
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
      const response = await fetch(`/api/card/${slug}`);
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
      link.download = `redflag-${slug}.png`;
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
    <div className="no-print flex flex-wrap gap-2">
      {canNativeShare && (
        <BrutButton variant="ink" onClick={nativeShare}>
          <Share2 className="size-4" strokeWidth={2.75} aria-hidden />
          Share
        </BrutButton>
      )}

      <BrutButton
        variant="judge"
        onClick={downloadCard}
        disabled={downloading}
        aria-busy={downloading}
      >
        <Download className="size-4" strokeWidth={2.75} aria-hidden />
        {downloading ? 'Saving…' : 'Save card'}
      </BrutButton>

      <BrutButton variant="ghost" onClick={copyLink}>
        {copied ? (
          <Check className="size-4" strokeWidth={2.75} aria-hidden />
        ) : (
          <Link2 className="size-4" strokeWidth={2.75} aria-hidden />
        )}
        {copied ? 'Copied' : 'Copy link'}
      </BrutButton>
    </div>
  );
}
