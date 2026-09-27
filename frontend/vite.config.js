import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// GitHub Pages cannot send response headers, so production builds carry the Content Security Policy
// as a <meta> tag. Scripts come only from this site. connect-src lists the AI providers RepoMind can
// call directly; an OpenAI-compatible endpoint on another host must be added here to be reachable.
// The dev server is excluded because React Refresh relies on an inline script.
export const CONTENT_SECURITY_POLICY = [
  "default-src 'self'",
  "script-src 'self'",
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: blob:",
  "font-src 'self' data:",
  "connect-src 'self' https://api.openai.com https://api.anthropic.com https://generativelanguage.googleapis.com",
  "frame-src 'self'",
  "worker-src 'self' blob:",
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'none'",
].join('; ');

const cspPlugin = {
  name: 'repomind-csp',
  apply: 'build',
  transformIndexHtml: () => [
    {
      tag: 'meta',
      attrs: { 'http-equiv': 'Content-Security-Policy', content: CONTENT_SECURITY_POLICY },
      injectTo: 'head-prepend',
    },
  ],
};

// GitHub Pages serves the app from /RepoMind/. Preview uses the same base so E2E can run against the
// production bundle exactly as it is deployed; the dev server stays at the root for convenience.
export default defineConfig(({ command, isPreview }) => ({
  base: command === 'build' || isPreview ? '/RepoMind/' : '/',
  plugins: [react(), cspPlugin],
  worker: { format: 'es' },
  test: {
    environment: 'node',
    include: ['src/**/*.test.{js,jsx}'],
  },
}));
