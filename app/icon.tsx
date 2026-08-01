import { ImageResponse } from 'next/og';

/**
 * Favicon, generated at build time.
 *
 * Deliberately text-free: an `ImageResponse` containing text needs a font buffer
 * passed in, and at 32×32 a glyph is illegible anyway. Pure geometry keeps this
 * dependency-free and immune to the variable-font problem that affects the share
 * cards (see lib/og/verdict-card.tsx).
 *
 * Reads as a small magenta flag on the void, echoing the wordmark.
 */

export const size = { width: 32, height: 32 };
export const contentType = 'image/png';

export default function Icon() {
  return new ImageResponse(
    (
      <div
        style={{
          width: '100%',
          height: '100%',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          background: '#07060C',
          borderRadius: 8,
        }}
      >
        {/* Flag pole */}
        <div
          style={{
            display: 'flex',
            width: 3,
            height: 20,
            background: '#F5F2FF',
            borderRadius: 2,
          }}
        />
        {/* Flag */}
        <div
          style={{
            display: 'flex',
            width: 12,
            height: 10,
            marginLeft: -1,
            marginBottom: 10,
            background: '#FF2E7E',
            borderRadius: 2,
          }}
        />
      </div>
    ),
    size
  );
}
