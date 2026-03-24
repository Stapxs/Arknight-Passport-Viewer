import { defineConfig, loadEnv } from 'vite';

function normalizeBase(basePath: string): string {
  const trimmed = basePath.trim();

  if (!trimmed) {
    return '/';
  }

  const withLeadingSlash = trimmed.startsWith('/') ? trimmed : `/${trimmed}`;
  return withLeadingSlash.endsWith('/') ? withLeadingSlash : `${withLeadingSlash}/`;
}

export default defineConfig(({ command, mode }) => {
  const env = loadEnv(mode, '.', '');
  const pagesBasePath = env.VITE_BASE_PATH;

  if (command === 'build' && pagesBasePath) {
    return {
      base: normalizeBase(pagesBasePath),
    };
  }

  return {
    base: '/',
  };
});
