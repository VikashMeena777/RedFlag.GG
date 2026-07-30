import type { MetadataRoute } from 'next';

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: 'RedFlag.GG — The Internet Court of Red Flags',
    short_name: 'RedFlag.GG',
    description:
      'File your dating drama. The jury votes. The AI judge delivers the verdict.',
    start_url: '/',
    display: 'standalone',
    background_color: '#F4EFE6',
    theme_color: '#F4EFE6',
  };
}
