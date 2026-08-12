import { config } from '../config/env';

export function buildPublicUrl(pathname: string) {
  const cleanPath = pathname.startsWith('/') ? pathname : `/${pathname}`;
  return `${config.publicBaseUrl}${cleanPath}`;
}

export function normalizeImageUrl(imageUrl?: string | null) {
  if (!imageUrl) return imageUrl;
  if (/^https?:\/\//i.test(imageUrl)) return imageUrl;
  return buildPublicUrl(imageUrl);
}
