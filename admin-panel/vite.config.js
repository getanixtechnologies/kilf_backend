import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'path';
// API base URL per git branch. Vercel exposes the branch being built as
// VERCEL_GIT_COMMIT_REF (GitHub Actions as GITHUB_REF_NAME). For these branches
// the branch decides, so a wrong VITE_API_URL in Vercel can't point dev at prod.
// Any other branch / local builds fall back to VITE_API_URL (from .env), then prod.
var API_URL_BY_BRANCH = {
    develop: 'https://dev.api.kilf.in',
    main: 'https://api.kilf.in',
};
var branch = process.env.VERCEL_GIT_COMMIT_REF || process.env.GITHUB_REF_NAME || '';
var branchApiUrl = API_URL_BY_BRANCH[branch];
export default defineConfig({
    plugins: [react()],
    resolve: {
        alias: {
            '@': path.resolve(__dirname, './src'),
        },
    },
    define: branchApiUrl
        ? { 'import.meta.env.VITE_API_URL': JSON.stringify(branchApiUrl) }
        : {},
    server: {
        port: 5173,
        host: true,
    },
});
