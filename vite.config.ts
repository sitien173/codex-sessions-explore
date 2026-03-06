import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig({
    plugins: [react()],
    publicDir: 'public',
    server: {
        // Allow serving from workspace root so sessions/YYYY/MM/DD/*.jsonl works
        fs: {
            allow: ['.'],
        },
    },
})
