export const extractTenantSlugFromPathname = (
  pathname: string,
  pathMarkers: string[],
): string | null => {
  if (pathMarkers.length === 0) {
    return null;
  }

  const segments = pathname.split('?')[0].split('/').filter(Boolean);

  for (const marker of pathMarkers) {
    const markerIndex = segments.indexOf(marker);
    if (markerIndex > 0) {
      return segments[markerIndex - 1] ?? null;
    }
  }

  return null;
};
