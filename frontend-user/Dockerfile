# ---- 构建阶段：运行题目/帮助/画布一致性清单（与本地 `npm test` 同一份） ----
FROM node:20-alpine AS check
WORKDIR /app
COPY package.json ./
COPY js ./js
COPY tests ./tests
RUN node tests/consistency-check.js \
 && node tests/quiz-solvable-check.js \
 && node tests/smoke-check.js

# ---- 运行阶段：nginx 静态托管 ----
FROM nginx:alpine

# 复制静态文件到nginx目录（只保留运行时需要的文件）
COPY --from=check /app/js /usr/share/nginx/html/js
COPY index.html /usr/share/nginx/html/
COPY css /usr/share/nginx/html/css

# 删除Dockerfile避免暴露
RUN rm -f /usr/share/nginx/html/Dockerfile

# 配置nginx
RUN echo 'server { \
    listen 80; \
    server_name localhost; \
    root /usr/share/nginx/html; \
    index index.html; \
    location / { \
        try_files $uri $uri/ /index.html; \
    } \
    location ~* \.(js|css|png|jpg|jpeg|gif|ico|svg)$ { \
        expires 1y; \
        add_header Cache-Control "public, immutable"; \
    } \
}' > /etc/nginx/conf.d/default.conf

EXPOSE 80

CMD ["nginx", "-g", "daemon off;"]
