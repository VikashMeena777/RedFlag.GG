import type { MetadataRoute } from 'next';

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: 'RedFlag.GG — The Internet Court of Red Flags',
    short_name: 'RedFlag.GG',
    description:
      'File your dating drama. The jury votes. The AI judge delivers the verdict.',
    start_url: '/',
    display: 'standalone',
    // Must track --color-page in globals.css. The old #F4EFE6 belonged to the
    // retired brutalist theme; the shipped editorial paper is #FBFAF7.
    background_color: '#FBFAF7',
    theme_color: '#FBFAF7',
  };
}
