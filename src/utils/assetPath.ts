const BASE_PATH = import.meta.env.BASE_URL;

export function assetPath(path: string): string {
  return `${BASE_PATH}${path.replace(/^\/+/, '')}`;
}
