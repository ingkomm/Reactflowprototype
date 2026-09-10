import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  base: process.env.GITHUB_ACTIONS ? '/Reactflowprototype/' : '/',
  server: {
    watch: {
      // Windows: avoid EBUSY watching locked Rust build DLLs under src-tauri/target.
      ignored: ['**/src-tauri/target/**'],
    },
  },
})
