# ---- 构建阶段：用统一清单（SPEC）校验物理引擎与文案口径 ----
# docker compose 的构建上下文为 frontend-user/，测试位于仓库根目录 ../tests，
# 因此在仓库根目录执行：docker build -f frontend-user/Dockerfile .
FROM node:20-alpine AS verify

WORKDIR /app
# 校验脚本与被校验的前端源码（测试直接加载 js/ 下的运行时代码，测试的就是画布实际代码）
COPY package.json ./
COPY tests ./tests
COPY frontend-user/js ./frontend-user/js
RUN node --test tests/

# ---- 运行阶段：纯静态站点 ----
FROM nginx:alpine

# 复制静态文件到nginx目录
COPY frontend-user/ /usr/share/nginx/html/

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
