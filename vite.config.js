import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// Relative base: the built page works at the site root or inside an iframe path.
export default defineConfig({
  plugins: [react()],
  base: './',
})
