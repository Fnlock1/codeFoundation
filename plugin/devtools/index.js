import {WebSocketServer} from 'ws';
import fs from 'fs';
import path from 'path';

export default function devToolsPlugin() {
    let wss;

    return {
        name: 'dev-tools-plugin',
        apply: 'serve',
        async configureServer(server) {
            console.log('[devToolsPlugin] Loaded:', server.config.root);

            // 创建 WebSocket 服务器
            const createWebSocketServer = () => {
                wss = new WebSocketServer({
                    noServer: true,
                });

                // 监听 WebSocket 连接
                wss.on('connection', (ws) => {
                    console.log('[devToolsPlugin] WebSocket connected');
                    ws.on('message', (message) => {
                        console.log('[devToolsPlugin] Message from devtools:', message);
                    });
                });

                server.httpServer.on('upgrade', (request, socket, head) => {
                    if (request.url === '/devtools') {
                        wss.handleUpgrade(request, socket, head, (ws) => {
                            wss.emit('connection', ws, request);
                        });
                    }
                });
            };

            createWebSocketServer();

            // 添加中间件处理 `/devtools` 路由
            server.middlewares.use('/devtools', (req, res, next) => {
                console.log('[devToolsPlugin] Request received:',res);

                if (req.method === 'GET') {
                    const devToolsHtmlPath = path.resolve('./plugin/devtools/index.html');
                    if (fs.existsSync(devToolsHtmlPath)) {
                        let html = fs.readFileSync(devToolsHtmlPath, 'utf-8');
                        res.writeHead(200, { 'Content-Type': 'text/html' });
                        res.end(html);
                    } else {
                        console.error('[devToolsPlugin] devtools.html not found:', devToolsHtmlPath);
                        res.writeHead(404, { 'Content-Type': 'text/plain' });
                        res.end('DevTools HTML file not found');
                    }
                } else {
                    next();
                }
            });

            // 监听 devtools 目录的变化，包含 JS 和 CSS 等文件
            const devToolsHtmlPath = path.resolve(server.config.root, 'plugin/devtools');
            console.log('[devToolsPlugin] Watching devtools directory:', devToolsHtmlPath);

            server.watcher.add(devToolsHtmlPath);

            server.watcher.on('change', async (file) => {
                console.log('[devToolsPlugin] devtools file updated:', file);

                const routerConfigPath = path.resolve(server.config.root, 'src/router/index.js');
                let routerConfig = [];

                try {
                    // 读取并解析 router.js 文件内容
                    const routerFile = fs.readFileSync(routerConfigPath, 'utf-8');

                    // 1. 去除所有注释（包括多行和单行注释）
                    const cleanedRouterFile = routerFile.replace(/\/\/.*$/gm, '').replace(/\/\*[\s\S]*?\*\//g, '');

                    // 2. 使用正则提取 routes 数组内容（去除 routes 字段名）
                    const routeMatches = cleanedRouterFile.match(/routes:\s*(\[[\s\S]*?\])/);

                    if (routeMatches && routeMatches[0]) {
                        // 去除 `routes:` 部分
                        const routesString = routeMatches[0].replace('routes:', '').trim();
                        // 将匹配的数组字符串转换为 JSON 对象数组
                        routerConfig =eval(`(() => { 
                          const HomeView = 'HomeView';  // 模拟 HomeView 组件
                          return ${routesString};
                        })()`);
                    }

                } catch (error) {
                    console.error('Error loading router config:', error);
                }

                // 向 WebSocket 客户端发送路由配置
                console.log(routerConfig)
                if (wss && wss.clients.size > 0) {
                    wss.clients.forEach((client) => {
                        if (client.readyState === client.OPEN) {
                            client.send(
                                JSON.stringify({
                                    type: 'router-update',
                                    data: routerConfig,
                                })
                            );
                        }
                    });
                }

                // 通知客户端刷新页面
                server.ws.send({
                    type: 'full-reload', // 通知客户端刷新页面
                });
            });
        },
    };
}
