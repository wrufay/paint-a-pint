import { defineConfig } from 'vite';

// two pages: the room (index.html) and the brush lab (lab.html)
export default defineConfig({
  build: {
    rollupOptions: { input: { main: 'index.html', lab: 'lab.html' } },
  },
});
