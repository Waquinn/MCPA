import http from 'node:http';
import {readFile, realpath, stat} from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {configure, root} from './configure-supabase.mjs';

const publicDirectories = new Set(['css', 'images', 'js', 'vendor', '1-admin', '2-engr', 'modules']);
const mime = {'.html':'text/html', '.js':'text/javascript', '.css':'text/css', '.svg':'image/svg+xml', '.png':'image/png', '.jpg':'image/jpeg', '.jpeg':'image/jpeg', '.webp':'image/webp', '.gif':'image/gif', '.ico':'image/x-icon', '.woff':'font/woff', '.woff2':'font/woff2', '.ttf':'font/ttf'};

export function createDevServer() {
  return http.createServer(async (req, res) => {
    res.setHeader('Cache-Control', 'no-store');
    res.setHeader('X-Content-Type-Options', 'nosniff');
    try {
      if (!['GET', 'HEAD'].includes(req.method)) { res.writeHead(405); res.end(); return; }
      let pathname = decodeURIComponent(new URL(req.url, 'http://localhost').pathname);
      if (pathname.endsWith('/')) pathname += 'index.html';
      const parts = pathname.slice(1).split('/');
      if (parts.some(part => !part || part.startsWith('.') || part.includes('\\') || ['tests','node_modules'].includes(part)) || (pathname !== '/index.html' && !publicDirectories.has(parts[0])) || !mime[path.extname(pathname)]) {
        res.writeHead(404); res.end(); return;
      }
      if (pathname === '/js/supabase-config.js') await configure();
      const file = await realpath(path.resolve(root, '.' + pathname));
      if (!file.startsWith(await realpath(root) + path.sep) || !(await stat(file)).isFile()) { res.writeHead(404); res.end(); return; }
      const content = await readFile(file);
      res.writeHead(200, {'Content-Type': mime[path.extname(file)]});
      res.end(req.method === 'HEAD' ? undefined : content);
    } catch (error) {
      res.writeHead(error.code === 'ENOENT' ? 404 : 500);
      res.end('Unable to serve this file. Check the server configuration.');
    }
  });
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    const config = await configure();
    const server = createDevServer();
    server.on('error', error => { console.error(error.code === 'EADDRINUSE' ? 'Port is already in use. Set PORT to another port.' : 'The local server could not start.'); process.exitCode = 1; });
    server.listen(Number(process.env.PORT || 5502), '127.0.0.1', () => {
      console.log(`MCPA: http://127.0.0.1:${server.address().port}`);
      console.log(`Database: ${config.supabaseUrl}`);
    });
  } catch (error) { console.error(error.message); process.exitCode = 1; }
}
