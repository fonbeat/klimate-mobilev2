export function resolveApiUrl(value: string | undefined, development: boolean) {
  const url = new URL(value || 'https://web-api.klimate.app');
  if (url.username || url.password || !['https:', ...(development ? ['http:'] : [])].includes(url.protocol)) {
    throw new Error('Klimate release connections require an HTTPS API URL without embedded credentials.');
  }
  return url.toString().replace(/\/$/, '');
}
